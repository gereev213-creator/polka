import asyncio
import json
import logging
import re
import time
import io
import os
import pickle
import random
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta, time as dtime
from typing import Any, Callable, Dict, List, Optional, Pattern, Set, Tuple, Union, Type
from urllib.parse import urljoin

def _strip_none(obj):
    """Рекурсивно удаляет ключи со значением None из dict и None-элементы из list."""
    if isinstance(obj, dict):
        return {k: _strip_none(v) for k, v in obj.items() if v is not None}
    elif isinstance(obj, list):
        return [_strip_none(v) for v in obj if v is not None]
    return obj

import aiohttp

logger = logging.getLogger(__name__)

MAX_API_BASE = "https://platform-api.max.ru"
DEFAULT_TIMEOUT = 60
MAX_RETRIES = 2
POLLING_TIMEOUT = 15
POLLING_INTERVAL = float(os.environ.get("MAX_POLLING_INTERVAL", "1"))

_MISSING = object()


def _build_url(endpoint: str) -> str:
    return f"{MAX_API_BASE}{endpoint}"


class _RateLimiter:
    def __init__(self, max_per_second: float = 30):
        self.max_per_second = max_per_second
        self._last_calls: List[float] = []

    async def acquire(self):
        now = time.monotonic()
        self._last_calls = [t for t in self._last_calls if now - t < 1.0]
        if len(self._last_calls) >= self.max_per_second:
            sleep_for = 1.0 - (now - self._last_calls[0])
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
        self._last_calls.append(time.monotonic())


class _HTTPClient:
    def __init__(self, token: str, session: Optional[aiohttp.ClientSession] = None):
        self._token = token
        self._session = session
        self._own_session = session is None
        self._rate_limiter = _RateLimiter()

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            import certifi, ssl as _ssl_mod
            _ssl_ctx = _ssl_mod.create_default_context(cafile=certifi.where())
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT),
                connector=aiohttp.TCPConnector(ssl=_ssl_ctx)
            )
            self._own_session = True
        return self._session

    async def close(self):
        if self._own_session and self._session:
            await self._session.close()
            self._session = None

    async def request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[dict] = None,
        data: Optional[aiohttp.FormData] = None,
        params: Optional[dict] = None,
        retries: int = MAX_RETRIES,
    ) -> dict:
        url = _build_url(endpoint)
        session = await self._get_session()

        last_error = ""
        for attempt in range(retries):
            await self._rate_limiter.acquire()
            try:
                headers = {"Authorization": self._token}
                kwargs: dict = {"headers": headers}
                if json_data is not None:
                    kwargs["json"] = {k: v for k, v in json_data.items() if v is not None}
                if data is not None:
                    kwargs["data"] = data
                if params:
                    kwargs["params"] = {k: v for k, v in params.items() if v is not None}

                async with session.request(method, url, **kwargs) as resp:
                    body = await resp.text()
                    if resp.status == 429:
                        retry_after = float(resp.headers.get("Retry-After", "1"))
                        await asyncio.sleep(retry_after)
                        last_error = f"rate_limited ({resp.status})"
                        if attempt < retries - 1:
                            continue
                        return {"ok": False, "error": last_error}
                    if resp.status >= 500:
                        last_error = f"server_error ({resp.status})"
                        if attempt < retries - 1:
                            await asyncio.sleep(2 ** attempt + random.random())
                            continue
                    try:
                        result = json.loads(body)
                    except json.JSONDecodeError:
                        if 200 <= resp.status < 300:
                            result = {"ok": True}
                        else:
                            result = {"ok": False, "error": body, "_status": resp.status}
                    return result
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                last_error = str(e)
                if attempt < retries - 1:
                    await asyncio.sleep(2 ** attempt + random.random())
                    continue
                return {"ok": False, "error": str(e)}
        return {"ok": False, "error": f"max retries exceeded: {last_error}"}

    async def get(self, endpoint: str, params: Optional[dict] = None) -> dict:
        return await self.request("GET", endpoint, params=params)

    async def post(self, endpoint: str, json_data: Optional[dict] = None, data: Optional[aiohttp.FormData] = None) -> dict:
        return await self.request("POST", endpoint, json_data=json_data, data=data)

    async def put(self, endpoint: str, json_data: Optional[dict] = None) -> dict:
        return await self.request("PUT", endpoint, json_data=json_data)

    async def patch(self, endpoint: str, json_data: Optional[dict] = None, params: Optional[dict] = None) -> dict:
        return await self.request("PATCH", endpoint, json_data=json_data, params=params)

    async def delete(self, endpoint: str, json_data: Optional[dict] = None, params: Optional[dict] = None) -> dict:
        return await self.request("DELETE", endpoint, json_data=json_data, params=params)


class ParseMode:
    HTML = "HTML"
    MARKDOWN = "Markdown"
    MARKDOWN_V2 = "MarkdownV2"


@dataclass
class User:
    id: int
    is_bot: bool = False
    first_name: str = ""
    last_name: Optional[str] = None
    username: Optional[str] = None
    language_code: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "User":
        if data is None:
            return None
        return cls(
            id=data.get("id") or data.get("user_id", 0),
            is_bot=data.get("is_bot", False),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name"),
            username=data.get("username"),
            language_code=data.get("language_code"),
        )


@dataclass
class Chat:
    id: int
    type: str = "private"
    title: Optional[str] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "Chat":
        if data is None:
            return None
        return cls(
            id=data.get("id", 0),
            type=data.get("type", "private"),
            title=data.get("title"),
            username=data.get("username"),
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
        )


@dataclass
class PhotoSize:
    file_id: str
    width: int
    height: int
    file_size: Optional[int] = None
    file_unique_id: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "PhotoSize":
        if data is None:
            return None
        return cls(
            file_id=data.get("file_id", ""),
            width=data.get("width", 0),
            height=data.get("height", 0),
            file_size=data.get("file_size"),
            file_unique_id=data.get("file_unique_id"),
        )


@dataclass
class WebAppData:
    data: str
    button_text: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "WebAppData":
        if data is None:
            return None
        return cls(
            data=data.get("data", ""),
            button_text=data.get("button_text"),
        )


@dataclass
class Contact:
    phone_number: str
    first_name: str
    last_name: Optional[str] = None
    user_id: Optional[int] = None

    @classmethod
    def from_dict(cls, data: dict) -> "Contact":
        if data is None:
            return None
        return cls(
            phone_number=data.get("phone_number", ""),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name"),
            user_id=data.get("user_id"),
        )


class Message:
    def __init__(self, data: dict, bot: Optional["Bot"] = None):
        self._bot = bot
        self.message_id = data.get("message_id", 0)
        self.date = datetime.fromtimestamp(data.get("date", 0)) if data.get("date") else datetime.now()
        self.text = data.get("text")
        self.caption = data.get("caption")
        self.from_user = User.from_dict(data.get("from"))
        self.chat = Chat.from_dict(data.get("chat"))
        self.reply_to_message = Message.from_dict(data.get("reply_to_message"), bot) if data.get("reply_to_message") else None

        raw_photo = data.get("photo")
        if raw_photo and isinstance(raw_photo, list):
            self.photo = [PhotoSize.from_dict(p) for p in raw_photo]
        else:
            self.photo = None

        self.entities = data.get("entities")
        self.caption_entities = data.get("caption_entities")
        self.new_chat_members = [User.from_dict(u) for u in (data.get("new_chat_members") or [])]
        self.web_app_data = WebAppData.from_dict(data.get("web_app_data"))
        self.contact = Contact.from_dict(data.get("contact"))
        self.chat_id = self.chat.id if self.chat else data.get("chat", {}).get("id", 0)

    @classmethod
    def from_dict(cls, data: dict, bot: Optional["Bot"] = None) -> Optional["Message"]:
        if data is None:
            return None
        return cls(data, bot=bot)

    def _set_bot(self, bot: "Bot"):
        self._bot = bot
        if self.reply_to_message:
            self.reply_to_message._set_bot(bot)

    async def reply_text(self, text: str, parse_mode: Optional[str] = None, reply_markup=None, **kwargs) -> Optional["Message"]:
        if not self._bot:
            return None
        return await self._bot.send_message(
            chat_id=self.chat.id,
            text=text,
            parse_mode=parse_mode,
            reply_markup=reply_markup,
            **kwargs,
        )

    async def reply_photo(self, photo, caption: Optional[str] = None, reply_markup=None, parse_mode: Optional[str] = None, **kwargs) -> Optional["Message"]:
        if not self._bot:
            return None
        return await self._bot.send_photo(
            chat_id=self.chat.id,
            photo=photo,
            caption=caption,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
            **kwargs,
        )

    async def reply_media_group(self, media: List["InputMediaPhoto"], **kwargs) -> Optional[List["Message"]]:
        if not self._bot:
            return None
        return await self._bot.send_media_group(
            chat_id=self.chat.id,
            media=media,
            **kwargs,
        )

    async def delete(self):
        if not self._bot:
            return None
        return await self._bot.delete_message(chat_id=self.chat.id, message_id=self.message_id)

    async def pin(self, disable_notification: bool = True):
        if not self._bot:
            return None
        return await self._bot.pin_chat_message(chat_id=self.chat.id, message_id=self.message_id)

    def __bool__(self):
        return True


class CallbackQuery:
    def __init__(self, data: dict, bot: Optional["Bot"] = None):
        self._bot = bot
        self.id = data.get("id", "")
        self.from_user = User.from_dict(data.get("from"))
        self.message = Message.from_dict(data.get("message"), bot) if data.get("message") else None
        self.data = data.get("data")
        self.inline_message_id = data.get("inline_message_id")
        self.chat_instance = data.get("chat_instance")

    def _set_bot(self, bot: "Bot"):
        self._bot = bot
        if self.message:
            self.message._set_bot(bot)

    async def answer(self, text: str = "", show_alert: bool = False, **kwargs):
        if not self._bot:
            return None
        return await self._bot.answer_callback_query(
            callback_query_id=self.id,
            text=text,
            show_alert=show_alert,
            **kwargs,
        )

    async def edit_message_text(self, text: str, parse_mode: Optional[str] = None, reply_markup=None, **kwargs) -> Optional[dict]:
        if not self._bot:
            return None
        chat_id = None
        message_id = None
        if self.message:
            chat_id = self.message.chat.id
            message_id = self.message.message_id
        if not chat_id or not message_id:
            return None
        return await self._bot.edit_message_text(
            chat_id=chat_id,
            message_id=message_id,
            text=text,
            parse_mode=parse_mode,
            reply_markup=reply_markup,
            **kwargs,
        )

    async def edit_message_caption(self, caption: str, parse_mode: Optional[str] = None, reply_markup=None, **kwargs) -> Optional[dict]:
        return await self.edit_message_text(caption, parse_mode=parse_mode, reply_markup=reply_markup, **kwargs)

    async def delete_message(self):
        if not self._bot:
            return None
        if self.message:
            return await self._bot.delete_message(
                chat_id=self.message.chat.id,
                message_id=self.message.message_id,
            )
        return None


class Update:
    ALL_TYPES = [
        "message", "edited_message", "channel_post", "edited_channel_post",
        "inline_query", "chosen_inline_result", "callback_query",
        "shipping_query", "pre_checkout_query", "poll", "poll_answer",
        "my_chat_member", "chat_member", "chat_join_request",
    ]

    def __init__(self, data: dict, bot: Optional["Bot"] = None):
        self.update_id = data.get("update_id", 0)
        self.message = Message.from_dict(data.get("message"), bot)
        self.edited_message = Message.from_dict(data.get("edited_message"), bot)
        self.channel_post = Message.from_dict(data.get("channel_post"), bot)
        self.edited_channel_post = Message.from_dict(data.get("edited_channel_post"), bot)
        self.callback_query = CallbackQuery(data.get("callback_query"), bot) if data.get("callback_query") else None
        self.inline_query = data.get("inline_query")
        self.chosen_inline_result = data.get("chosen_inline_result")
        self.poll = data.get("poll")
        self.poll_answer = data.get("poll_answer")
        self.my_chat_member = data.get("my_chat_member")
        self.chat_member = data.get("chat_member")
        self.chat_join_request = data.get("chat_join_request")

    def _set_bot(self, bot: "Bot"):
        if self.message:
            self.message._set_bot(bot)
        if self.edited_message:
            self.edited_message._set_bot(bot)
        if self.channel_post:
            self.channel_post._set_bot(bot)
        if self.edited_channel_post:
            self.edited_channel_post._set_bot(bot)
        if self.callback_query:
            self.callback_query._set_bot(bot)

    @property
    def effective_user(self) -> Optional[User]:
        if self.message and self.message.from_user:
            return self.message.from_user
        if self.callback_query and self.callback_query.from_user:
            return self.callback_query.from_user
        if self.edited_message and self.edited_message.from_user:
            return self.edited_message.from_user
        return None

    @property
    def effective_chat(self) -> Optional[Chat]:
        if self.message and self.message.chat:
            return self.message.chat
        if self.callback_query and self.callback_query.message and self.callback_query.message.chat:
            return self.callback_query.message.chat
        if self.edited_message and self.edited_message.chat:
            return self.edited_message.chat
        return None

    @classmethod
    def from_dict(cls, data: dict, bot: Optional["Bot"] = None) -> "Update":
        return cls(data, bot=bot)

    def __repr__(self) -> str:
        return f"Update(update_id={self.update_id})"


class InputFile:
    def __init__(self, file, filename: Optional[str] = None):
        if isinstance(file, str):
            self._path = file
            self._data = None
            self._filename = filename or os.path.basename(file)
        elif isinstance(file, (bytes, bytearray)):
            self._data = file
            self._path = None
            self._filename = filename or "file"
        elif hasattr(file, "read"):
            self._data = file.read()
            self._path = None
            self._filename = filename or getattr(file, "name", "file")
        else:
            self._path = None
            self._data = file
            self._filename = filename or "file"

    def to_form_data(self, field_name: str = "document") -> aiohttp.FormData:
        form = aiohttp.FormData()
        if self._path:
            form.add_field(field_name, open(self._path, "rb"), filename=self._filename)
        elif self._data is not None:
            form.add_field(field_name, self._data, filename=self._filename)
        return form


class InlineKeyboardButton:
    def __init__(self, text: str, callback_data: Optional[str] = None, url: Optional[str] = None, **kwargs):
        self.text = text
        self.callback_data = callback_data
        self.url = url
        self._extra = kwargs

    def to_dict(self) -> dict:
        result = {"text": self.text}
        if self.callback_data is not None:
            callback_bytes = self.callback_data.encode("utf-8") if isinstance(self.callback_data, str) else self.callback_data
            if isinstance(callback_bytes, bytes) and len(callback_bytes) > 64:
                result["callback_data"] = callback_bytes[:64].decode("utf-8", errors="ignore")
            else:
                result["callback_data"] = self.callback_data
        if self.url is not None:
            result["url"] = self.url
        result.update(self._extra)
        return result


class InlineKeyboardMarkup:
    def __init__(self, inline_keyboard: List[List[InlineKeyboardButton]]):
        self.inline_keyboard = inline_keyboard

    def to_dict(self) -> dict:
        return {
            "inline_keyboard": [
                [btn.to_dict() for btn in row]
                for row in self.inline_keyboard
            ]
        }


class KeyboardButton:
    def __init__(self, text: str, **kwargs):
        self.text = text
        self._extra = kwargs

    def to_dict(self) -> dict:
        result = {"text": self.text}
        result.update(self._extra)
        return result


class ReplyKeyboardMarkup:
    def __init__(self, keyboard: List[List[KeyboardButton]], resize_keyboard: bool = False, one_time_keyboard: bool = False, **kwargs):
        self.keyboard = keyboard
        self.resize_keyboard = resize_keyboard
        self.one_time_keyboard = one_time_keyboard
        self._extra = kwargs

    def to_dict(self) -> dict:
        result = {
            "keyboard": [
                [btn.to_dict() for btn in row]
                for row in self.keyboard
            ],
            "resize_keyboard": self.resize_keyboard,
            "one_time_keyboard": self.one_time_keyboard,
        }
        result.update(self._extra)
        return result


class ReplyKeyboardRemove:
    def __init__(self, remove_keyboard: bool = True, **kwargs):
        self.remove_keyboard = remove_keyboard
        self._extra = kwargs

    def to_dict(self) -> dict:
        result = {"remove_keyboard": self.remove_keyboard}
        result.update(self._extra)
        return result


class InputMediaPhoto:
    def __init__(self, media: str, caption: Optional[str] = None, parse_mode: Optional[str] = None, **kwargs):
        self.media = media
        self.caption = caption
        self.parse_mode = parse_mode
        self._extra = kwargs

    def to_dict(self) -> dict:
        result = {
            "type": "photo",
            "media": self.media,
        }
        if self.caption is not None:
            result["caption"] = self.caption
        if self.parse_mode is not None:
            result["parse_mode"] = self.parse_mode
        result.update(self._extra)
        return result


class BotCommand:
    def __init__(self, command: str, description: str):
        self.command = command
        self.description = description

    def to_dict(self) -> dict:
        return {"command": self.command, "description": self.description}


class MenuButtonCommands:
    def __init__(self):
        self.type = "commands"

    def to_dict(self) -> dict:
        return {"type": "commands"}


class _Filter:
    def __init__(self, predicate: Optional[Callable] = None):
        self._predicate = predicate

    def __call__(self, update: Update) -> bool:
        if self._predicate:
            try:
                return self._predicate(update)
            except Exception:
                return False
        return True

    def __and__(self, other: "_Filter") -> "_Filter":
        return _CombinedFilter(self, other, "and")

    def __or__(self, other: "_Filter") -> "_Filter":
        return _CombinedFilter(self, other, "or")

    def __invert__(self) -> "_Filter":
        return _InvertedFilter(self)

    def __repr__(self) -> str:
        return f"Filter({self._predicate})"


class _InvertedFilter(_Filter):
    def __init__(self, f: _Filter):
        super().__init__()
        self._f = f

    def __call__(self, update: Update) -> bool:
        return not self._f(update)

    def __repr__(self) -> str:
        return f"~{self._f!r}"


class _CombinedFilter(_Filter):
    def __init__(self, f1: _Filter, f2: _Filter, op: str):
        super().__init__()
        self._f1 = f1
        self._f2 = f2
        self._op = op

    def __call__(self, update: Update) -> bool:
        if self._op == "and":
            return self._f1(update) and self._f2(update)
        elif self._op == "or":
            return self._f1(update) or self._f2(update)
        return False

    def __repr__(self) -> str:
        return f"({self._f1!r} {self._op} {self._f2!r})"


class _Filters:
    TEXT = _Filter(lambda u: u.message is not None and u.message.text is not None and not u.message.text.startswith("/"))
    COMMAND = _Filter(lambda u: u.message is not None and u.message.text is not None and u.message.text.startswith("/"))
    PHOTO = _Filter(lambda u: u.message is not None and u.message.photo is not None)
    REPLY = _Filter(lambda u: u.message is not None and u.message.reply_to_message is not None)
    CONTACT = _Filter(lambda u: u.message is not None and u.message.contact is not None)
    VOICE = _Filter(lambda u: u.message is not None and u.message.get("voice") is not None)
    DOCUMENT = _Filter(lambda u: u.message is not None and u.message.get("document") is not None)

    class StatusUpdate:
        NEW_CHAT_MEMBERS = _Filter(lambda u: u.message is not None and bool(u.message.new_chat_members))
        WEB_APP_DATA = _Filter(lambda u: u.message is not None and u.message.web_app_data is not None)
        PINNED_MESSAGE = _Filter(lambda u: u.message is not None and u.message.get("pinned_message") is not None)

    ALL = _Filter(lambda u: True)


filters = _Filters()


class Context:
    def __init__(self, application: "Application", update: Update):
        self.bot = application.bot
        self.job_queue = application.job_queue
        self.application = application
        self._update = update
        self._application = application
        self.user_data: dict = {}
        self.chat_data: dict = {}
        self.bot_data: dict = {}
        self.job: Optional["Job"] = None
        self.args: Optional[List[str]] = None
        self._state: Optional[object] = None
        self._error: Optional[Exception] = None
        if update.effective_user:
            uid = update.effective_user.id
            self.user_data = application._user_data.setdefault(uid, {})
        if update.message and update.message.chat:
            cid = update.message.chat.id
            self.chat_data = application._chat_data.setdefault(cid, {})

    @property
    def error(self) -> Optional[Exception]:
        return self._error

    @classmethod
    def from_job(cls, application: "Application", job: "Job") -> "Context":
        ctx = cls.__new__(cls)
        ctx.bot = application.bot
        ctx.job_queue = application.job_queue
        ctx.application = application
        ctx._application = application
        ctx._update = None
        ctx.user_data = {}
        ctx.chat_data = {}
        ctx.bot_data = application._bot_data
        ctx.job = job
        ctx.args = None
        ctx._state = None
        return ctx


class ContextTypes:
    DEFAULT_TYPE = Context


class Job:
    def __init__(
        self,
        callback: Callable,
        job_queue: "JobQueue",
        data: Any = None,
        name: Optional[str] = None,
    ):
        self.callback = callback
        self.job_queue = job_queue
        self.data = data
        self.name = name
        self._task: Optional[asyncio.Task] = None
        self._interval: Optional[float] = None
        self._next_run: Optional[float] = None
        self._removed = False

    async def run(self, application: "Application"):
        if self._removed:
            return
        ctx = Context.from_job(application, self)
        try:
            await self.callback(ctx)
        except Exception as e:
            logger.error(f"Job {self.name} error: {e}", exc_info=True)


class JobQueue:
    def __init__(self):
        self._jobs: List[Job] = []
        self._scheduler_running = False
        self._scheduler_task: Optional[asyncio.Task] = None
        self._application: Optional["Application"] = None

    def _set_application(self, app: "Application"):
        self._application = app

    def run_once(self, callback: Callable, when: Union[float, timedelta, datetime], data: Any = None, name: Optional[str] = None) -> Job:
        job = Job(callback, self, data=data, name=name)
        if isinstance(when, timedelta):
            job._next_run = time.monotonic() + when.total_seconds()
        elif isinstance(when, datetime):
            job._next_run = when.timestamp()
        else:
            job._next_run = time.monotonic() + when
        self._jobs.append(job)
        return job

    def run_repeating(self, callback: Callable, interval: Union[float, timedelta], first: Union[float, timedelta, None] = None, data: Any = None, name: Optional[str] = None) -> Job:
        job = Job(callback, self, data=data, name=name)
        if isinstance(interval, timedelta):
            job._interval = interval.total_seconds()
        else:
            job._interval = interval
        now = time.monotonic()
        if first is None:
            job._next_run = now + job._interval
        elif isinstance(first, timedelta):
            job._next_run = now + first.total_seconds()
        else:
            job._next_run = now + first
        self._jobs.append(job)
        return job

    def run_daily(self, callback: Callable, time: dtime, data: Any = None, name: Optional[str] = None) -> Job:
        now = datetime.now()
        target = now.replace(hour=time.hour, minute=time.minute, second=time.second, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        delay = (target - now).total_seconds()
        job = self.run_once(callback, delay, data=data, name=name)
        job._interval = 86400.0
        return job

    async def _scheduler_loop(self):
        while self._scheduler_running:
            now = time.monotonic()
            due = []
            for job in list(self._jobs):
                if job._removed:
                    self._jobs.remove(job)
                    continue
                if job._next_run and now >= job._next_run:
                    due.append(job)

            for job in due:
                if job._removed:
                    continue
                if self._application:
                    await job.run(self._application)
                if job._interval:
                    job._next_run = time.monotonic() + job._interval
                else:
                    job._removed = True
                    if job in self._jobs:
                        self._jobs.remove(job)

            await asyncio.sleep(0.5)

    def start(self):
        if not self._scheduler_running:
            self._scheduler_running = True
            self._scheduler_task = asyncio.create_task(self._scheduler_loop())

    def stop(self):
        self._scheduler_running = False
        if self._scheduler_task:
            self._scheduler_task.cancel()
            self._scheduler_task = None


class ChatMember:
    def __init__(self, data: dict):
        self.status = data.get("status", "")
        self.user = User.from_dict(data.get("user"))
        self.is_member = data.get("is_member", False)

    @classmethod
    def from_dict(cls, data: dict) -> "ChatMember":
        return cls(data or {})


class File:
    def __init__(self, data: dict, bot: Optional["Bot"] = None):
        self._bot = bot
        self.file_id = data.get("fileId") or data.get("file_id", "")
        self.file_unique_id = data.get("fileUniqueId") or data.get("file_unique_id", "")
        self.file_size = data.get("fileSize") or data.get("file_size")
        self.file_path = (data.get("filePath") or data.get("file_path") or
                         data.get("url") or data.get("link") or data.get("download_url"))

    @property
    def file_url(self) -> Optional[str]:
        return self.file_path

    async def download_to_memory(self, buf: io.BytesIO) -> None:
        if not self.file_path:
            raise ValueError("file_path is empty")
        import ssl as _ssl_fix
        _ssl_ctx = _ssl_fix._create_unverified_context()
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=_ssl_ctx)) as s:
            async with s.get(self.file_path) as r:
                if r.status != 200:
                    raise Exception(f"download_to_memory failed: HTTP {r.status}")
                data = await r.read()
                buf.write(data)
                buf.seek(0)


class Bot:
    def __init__(self, token: str):
        self.token = token
        self._http_client = _HTTPClient(token)
        self._me: Optional[User] = None

    async def close(self):
        await self._http_client.close()

    def _resolve_reply_markup(self, reply_markup) -> Optional[list]:
        if reply_markup is None:
            return None
        if hasattr(reply_markup, "to_dict"):
            data = reply_markup.to_dict()
        elif isinstance(reply_markup, (dict, str)):
            try:
                data = json.loads(reply_markup) if isinstance(reply_markup, str) else reply_markup
            except (json.JSONDecodeError, TypeError):
                return None
        else:
            return None
        inline_keyboard = data.get("inline_keyboard")
        if not inline_keyboard:
            return None
        buttons = []
        for row in inline_keyboard:
            max_row = []
            for btn in row:
                if "url" in btn:
                    max_row.append({"type": "link", "text": btn["text"], "url": btn["url"]})
                else:
                    cb = btn.get("callback_data", "")
                    if isinstance(cb, str):
                        cb_bytes = cb.encode("utf-8")[:64]
                        cb = cb_bytes.decode("utf-8", errors="ignore")
                    max_row.append({"type": "callback", "text": btn["text"], "payload": cb})
            buttons.append(max_row)
        return [{"type": "inline_keyboard", "payload": {"buttons": buttons}}]

    def _normalize_response(self, resp: Any) -> dict:
        if resp is None:
            return {"ok": False, "error": "empty response"}
        if isinstance(resp, dict):
            if "ok" in resp:
                return resp
            if "error" in resp:
                return {"ok": False, "error": resp["error"]}
            if "result" in resp:
                return resp
            if "code" in resp and "message" in resp and "result" not in resp:
                return {"ok": False, "error": f"{resp['code']}: {resp['message']}"}
            return {"ok": True, "result": resp}
        return {"ok": True, "result": resp}

    @staticmethod
    def _normalize_message(data: dict) -> dict:
        if data is None:
            return {}
        # MAX API wraps outgoing message responses in {"message": {...}}
        if "message" in data and isinstance(data["message"], dict):
            inner = data["message"]
            body = inner.get("body") or {}
            sender = inner.get("sender") or {}
            recipient = inner.get("recipient") or {}
            data = {
                "message_id": body.get("mid") or inner.get("id", 0),
                "date": (inner.get("timestamp", 0) or 0) // 1000,
                "text": body.get("text", ""),
                "from": {
                    "id": sender.get("user_id", sender.get("id", 0)),
                    "is_bot": sender.get("is_bot", False),
                    "first_name": sender.get("first_name", ""),
                    "last_name": sender.get("last_name"),
                    "username": sender.get("username"),
                },
                "chat": {
                    "id": recipient.get("chat_id") or recipient.get("user_id") or recipient.get("id", 0),
                    "type": recipient.get("chat_type", "private"),
                },
            }
            # Preserve photo from attachments (MAX returns payload with url)
            attachments = body.get("attachments") or []
            photo_list = []
            for a in attachments:
                if a.get("type") in ("image", "photo"):
                    payload = a.get("payload")
                    if payload:
                        import json as _json
                        fid = _json.dumps(payload)
                        photo_list.append({"file_id": fid, "width": 0, "height": 0})
            if photo_list:
                data["photo"] = photo_list
        elif data and "id" in data and "message_id" not in data:
            data["message_id"] = data["id"]
        return data

    def _chat_params(self, chat_id: Union[int, str]) -> dict:
        if isinstance(chat_id, str) and chat_id.startswith("-"):
            return {"chat_id": chat_id.lstrip("@")}
        if isinstance(chat_id, str) and chat_id.startswith("@"):
            return {"chat_id": chat_id.lstrip("@")}
        return {"user_id": str(chat_id)}

    async def upload_file(self, file_data: bytes, filename: str = "file", file_type: str = "image", max_retries: int = 2) -> Optional[dict]:
        logger.info(f"upload_file: getting upload URL for type={file_type}")
        for attempt in range(max_retries):
            upload_resp = await self._http_client.request("POST", f"/uploads?type={file_type}")
            if not upload_resp.get("url"):
                logger.warning(f"upload_file: failed to get upload URL (attempt {attempt+1}): {upload_resp}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)
                    continue
                return None
            upload_url = upload_resp["url"]
            logger.info(f"upload_file: uploading {len(file_data)} bytes (attempt {attempt+1})")
            form = aiohttp.FormData()
            form.add_field("data", file_data, filename=filename)
            session = await self._http_client._get_session()
            try:
                async with session.post(upload_url, data=form, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status >= 400:
                        body = await resp.text()
                        logger.warning(f"upload_file: upload failed ({resp.status}): {body}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(2)
                            continue
                        return None
                    try:
                        payload = await resp.json()
                        logger.info(f"upload_file: upload success, keys={list(payload.keys())}")
                        return payload
                    except Exception as e:
                        logger.warning(f"upload_file: parse response failed: {e}")
                        return None
            except asyncio.TimeoutError:
                logger.warning(f"upload_file: timeout (attempt {attempt+1})")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2)
                    continue
                return None
        return None

    async def send_message(self, chat_id: Union[int, str], text: str, parse_mode: Optional[str] = None, reply_markup=None, **kwargs) -> Optional[Message]:
        attachments = self._resolve_reply_markup(reply_markup)
        body = {"text": text}
        if parse_mode and parse_mode.lower() in ("html", "markdown"):
            body["format"] = parse_mode.lower()
        if attachments:
            body["attachments"] = attachments
        body = _strip_none(body)
        params = self._chat_params(chat_id)
        raw_resp = await self._http_client.request("POST", "/messages", json_data=body, params=params)
        logger.info(f"send_message body sent: {body}")
        resp = self._normalize_response(raw_resp)
        logger.info(f"send_message raw response: {raw_resp}")
        if resp.get("ok") and resp.get("result"):
            return Message(self._normalize_message(resp["result"]), bot=self)
        logger.warning(f"send_message failed: chat_id={chat_id} error={resp.get('error','')} text={text[:50]}")
        return None

    async def send_photo(self, chat_id: Union[int, str], photo, caption: Optional[str] = None, reply_markup=None, parse_mode: Optional[str] = None, **kwargs) -> Optional[Message]:
        params = self._chat_params(chat_id)
        attachments = []
        if isinstance(photo, str) and (photo.startswith("http://") or photo.startswith("https://")):
            logger.info(f"send_photo: downloading {photo[:60]}...")
            async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as dl_session:
                async with dl_session.get(photo) as img_resp:
                    if img_resp.status >= 400:
                        logger.warning(f"send_photo: failed to download {photo} status={img_resp.status}")
                        img_data = None
                    else:
                        img_data = await img_resp.read()
                        logger.info(f"send_photo: downloaded {len(img_data)} bytes")
            if img_data:
                filename = photo.rsplit("/", 1)[-1] or "image.png"
                uploaded = await self.upload_file(img_data, filename=filename)
                if uploaded:
                    attachments.append({"type": "image", "payload": uploaded})
                else:
                    logger.warning("send_photo: upload failed, sending text only")
            else:
                pass
        elif isinstance(photo, str):
            try:
                parsed = json.loads(photo)
                if isinstance(parsed, dict):
                    attachments.append({"type": "image", "payload": parsed})
                else:
                    logger.warning(f"send_photo: unsupported photo string (not URL/JSON) — skipping: {photo[:60]}")
            except (json.JSONDecodeError, TypeError):
                logger.warning(f"send_photo: unsupported photo string (not URL/JSON) — skipping: {photo[:60]}")
        elif isinstance(photo, InputFile):
            uploaded = await self.upload_file(photo._data or open(photo._path, "rb").read(), filename=photo._filename)
            if uploaded:
                attachments.append({"type": "image", "payload": uploaded})
        elif hasattr(photo, "read"):
            data = photo.read()
            uploaded = await self.upload_file(data, filename=getattr(photo, "name", "file"))
            if uploaded:
                attachments.append({"type": "image", "payload": uploaded})
        elif isinstance(photo, (bytes, bytearray)):
            uploaded = await self.upload_file(photo, filename="file")
            if uploaded:
                attachments.append({"type": "image", "payload": uploaded})
        rm = self._resolve_reply_markup(reply_markup)
        if rm:
            attachments.extend(rm)
        body = {"text": caption or ""}
        if attachments:
            body["attachments"] = attachments
        if parse_mode and parse_mode.lower() in ("html", "markdown"):
            body["format"] = parse_mode.lower()
        # Убираем null-значения вложенных полей — MAX proto не принимает null
        body = _strip_none(body)
        resp = await self._http_client.request("POST", "/messages", json_data=body, params=params)
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            logger.info(f"send_photo success: chat_id={chat_id}")
            return Message(self._normalize_message(resp["result"]), bot=self)
        logger.warning(f"send_photo failed: chat_id={chat_id} error={resp.get('error','')}")
        return None

    async def send_media_group(self, chat_id: Union[int, str], media: List[InputMediaPhoto], **kwargs) -> Optional[List[Message]]:
        params = self._chat_params(chat_id)
        reply_markup = kwargs.pop('reply_markup', None)
        all_attachments = []
        caption = None
        parse_mode = None
        for i, m in enumerate(media):
            if i == 0:
                caption = m.caption
                parse_mode = m.parse_mode
            photo = m.media
            if isinstance(photo, str) and (photo.startswith("http://") or photo.startswith("https://")):
                logger.info(f"send_media_group: downloading {photo[:60]}...")
                async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as dl_session:
                    async with dl_session.get(photo) as img_resp:
                        if img_resp.status >= 400:
                            logger.warning(f"send_media_group: failed to download {photo} status={img_resp.status}")
                            continue
                        img_data = await img_resp.read()
                uploaded = await self.upload_file(img_data, filename=photo.rsplit("/", 1)[-1] or "image.png")
                if uploaded:
                    all_attachments.append({"type": "image", "payload": uploaded})
            elif isinstance(photo, str):
                try:
                    parsed = json.loads(photo)
                    if isinstance(parsed, dict):
                        all_attachments.append({"type": "image", "payload": parsed})
                    else:
                        logger.warning(f"send_media_group: unsupported photo string (not URL/JSON) — skipping: {photo[:60]}")
                except (json.JSONDecodeError, TypeError):
                    logger.warning(f"send_media_group: unsupported photo string (not URL/JSON) — skipping: {photo[:60]}")
            else:
                logger.warning(f"send_media_group: unsupported media type {type(photo)}")
                continue
        if not all_attachments:
            return None
        rm = self._resolve_reply_markup(reply_markup)
        if rm:
            all_attachments.extend(rm)
        body = {"text": caption or "", "attachments": all_attachments}
        if parse_mode and parse_mode.lower() in ("html", "markdown"):
            body["format"] = parse_mode.lower()
        body = _strip_none(body)
        resp = await self._http_client.request("POST", "/messages", json_data=body, params=params)
        logger.info(f"send_media_group response: chat_id={chat_id} status={resp}")
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            return [Message(self._normalize_message(resp["result"]), bot=self)]
        logger.warning(f"send_media_group failed: chat_id={chat_id} error={resp.get('error','')}")
        return None

    def _resolve_photo_ref(self, photo_ref: str) -> Tuple[str, Optional[str]]:
        """Resolve photo_ref to (file_id_or_token, optional_direct_url).
        
        MAX photos may be stored as JSON-encoded upload payloads.
        Returns (token_for_files_api, direct_url_or_None).
        """
        raw = photo_ref
        direct_url = None
        try:
            payload = json.loads(photo_ref)
            if isinstance(payload, dict):
                # Unwrap "result" wrapper if present (common in MAX API responses)
                inner_payload = payload.get("result") if isinstance(payload.get("result"), dict) else payload
                # Upload response: {"photos": {"hash": {"token": "...", "url": "..."}}}
                photos_dict = inner_payload.get("photos")
                if isinstance(photos_dict, dict):
                    for inner in photos_dict.values():
                        if isinstance(inner, dict):
                            for key in ("url", "file_path", "filePath", "link", "download_url"):
                                val = inner.get(key)
                                if val and isinstance(val, str) and val.startswith("http"):
                                    direct_url = val
                                    break
                            token = inner.get("file_id") or inner.get("fileId") or inner.get("token") or inner.get("id")
                            if token:
                                raw = token
                                break
                # Direct URL if present at top level
                if not direct_url:
                    for key in ("url", "file_path", "filePath", "link", "download_url"):
                        val = inner_payload.get(key)
                        if val and isinstance(val, str) and val.startswith("http"):
                            direct_url = val
                            break
                # Token/file_id for files API (only if not already set from photos dict)
                if raw == photo_ref:
                    raw = (inner_payload.get("file_id") or inner_payload.get("fileId") or
                           inner_payload.get("token") or inner_payload.get("id") or raw)
        except (json.JSONDecodeError, TypeError):
            pass
        if direct_url:
            logger.debug(f"_resolve_photo_ref: found direct_url={direct_url[:80]}...")
        else:
            logger.debug(f"_resolve_photo_ref: no direct_url, raw={str(raw)[:60]}...")
        return raw, direct_url

    async def get_photo_bytes(self, photo_ref: str) -> Optional[bytes]:
        if not photo_ref:
            return None
        file_id, direct_url = self._resolve_photo_ref(photo_ref)
        logger.debug(f"get_photo_bytes: resolved file_id={str(file_id)[:60]} direct_url={str(direct_url)[:80] if direct_url else None}")
        # Try direct URL first
        if direct_url:
            try:
                async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as s:
                    async with s.get(direct_url) as r:
                        if r.status == 200:
                            data = await r.read()
                            logger.info(f"get_photo_bytes: downloaded from direct_url ({len(data)} bytes)")
                            return data
                        logger.debug(f"get_photo_bytes: direct_url HTTP {r.status}")
            except Exception as e:
                logger.debug(f"get_photo_bytes: direct_url error: {e}")
        # Try via MAX files API (get file info + download URL)
        try:
            f = await self.get_file(file_id)
            if f and f.file_path:
                async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as s:
                    async with s.get(f.file_path) as r:
                        if r.status == 200:
                            data = await r.read()
                            logger.info(f"get_photo_bytes: downloaded from file_path ({len(data)} bytes)")
                            return data
                        logger.debug(f"get_photo_bytes: file_path HTTP {r.status}")
        except Exception as e:
            logger.debug(f"get_photo_bytes: file_path error: {e}")
        # Try downloading directly from MAX API with auth headers
        api_urls = [
            f"{MAX_API_BASE}/files/{file_id}",
            f"{MAX_API_BASE}/files/{file_id}/download",
        ]
        headers = {"Authorization": self.token}
        for url in api_urls:
            try:
                async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as s:
                    async with s.get(url, headers=headers) as r:
                        if r.status == 200:
                            data = await r.read()
                            if len(data) > 50:
                                logger.info(f"get_photo_bytes: downloaded from MAX API ({len(data)} bytes) url={url[:80]}")
                                return data
                            logger.debug(f"get_photo_bytes: MAX API {url[:80]} too small ({len(data)} bytes)")
            except Exception as e:
                logger.debug(f"get_photo_bytes: MAX API {url[:80]} -> {e}")

        # Fallback: try constructing download URL from various patterns
        for pattern in [
            f"{MAX_API_BASE}/file/bot{self.token}/{file_id}",
            f"{MAX_API_BASE}/files/{file_id}",
            f"https://web.max.ru/file/{file_id}",
            f"https://max.ru/file/{file_id}",
            f"https://cdn.max.ru/{file_id}",
            f"https://api.max.ru/v1/files/{file_id}",
            f"https://upload.max.ru/{file_id}",
        ]:
            try:
                async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as s:
                    async with s.get(pattern) as r:
                        if r.status == 200:
                            data = await r.read()
                            if len(data) > 50:
                                logger.info(f"get_photo_bytes: downloaded from {pattern[:80]} ({len(data)} bytes)")
                                return data
                            logger.debug(f"get_photo_bytes: fallback {pattern[:80]} -> too small ({len(data)} bytes)")
            except Exception as e:
                logger.debug(f"get_photo_bytes: fallback {pattern[:80]} -> {e}")

        # Last resort: try the file_id itself as a URL (some platforms return full URLs)
        if file_id and (file_id.startswith("http://") or file_id.startswith("https://")):
            try:
                async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as s:
                    async with s.get(file_id) as r:
                        if r.status == 200:
                            data = await r.read()
                            logger.info(f"get_photo_bytes: downloaded from file_id-as-url ({len(data)} bytes)")
                            return data
            except Exception as e:
                logger.debug(f"get_photo_bytes: file_id-as-url -> {e}")

        logger.warning(f"get_photo_bytes: all fallbacks exhausted for file_id={str(file_id)[:50]}")
        return None

    async def edit_message_text(self, chat_id: Union[int, str], message_id: int, text: str, parse_mode: Optional[str] = None, reply_markup=None, clear_attachments: bool = False, **kwargs) -> Optional[Message]:
        attachments = self._resolve_reply_markup(reply_markup)
        body = {"text": text}
        if parse_mode and parse_mode.lower() in ("html", "markdown"):
            body["format"] = parse_mode.lower()
        if clear_attachments:
            body["attachments"] = []
        elif attachments:
            body["attachments"] = attachments
        body = _strip_none(body)
        params = self._chat_params(chat_id)
        resp = await self._http_client.patch(f"/messages/{message_id}", json_data=body, params=params)
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            return Message(self._normalize_message(resp["result"]), bot=self)
        return None

    async def edit_message_caption(self, chat_id: Union[int, str], message_id: int, caption: str, parse_mode: Optional[str] = None, reply_markup=None, clear_attachments: bool = False, **kwargs) -> Optional[Message]:
        return await self.edit_message_text(chat_id, message_id, caption, parse_mode=parse_mode, reply_markup=reply_markup, clear_attachments=clear_attachments, **kwargs)

    async def delete_message(self, chat_id: Union[int, str], message_id: int) -> bool:
        params = self._chat_params(chat_id)
        resp = await self._http_client.delete(f"/messages/{message_id}", params=params)
        resp = self._normalize_response(resp)
        if not resp.get("ok", False):
            logger.debug(f"delete_message failed: chat_id={chat_id} msg_id={message_id} error={resp.get('error', resp)}")
        return resp.get("ok", False)

    async def answer_callback_query(self, callback_query_id: str, text: str = "", show_alert: bool = False) -> bool:
        body = {}
        if text:
            body["notification"] = text
        if show_alert:
            body["show_alert"] = True
        resp = await self._http_client.post(f"/answers?callback_id={callback_query_id}", json_data=body or None)
        resp = self._normalize_response(resp)
        return resp.get("ok", False)

    async def pin_chat_message(self, chat_id: Union[int, str], message_id: int, disable_notification: bool = True) -> bool:
        resp = await self._http_client.post(f"/messages/{message_id}/pin")
        resp = self._normalize_response(resp)
        return resp.get("ok", False)

    async def unpin_chat_message(self, chat_id: Union[int, str], message_id: int) -> bool:
        resp = await self._http_client.delete(f"/messages/{message_id}/pin")
        resp = self._normalize_response(resp)
        return resp.get("ok", False)

    async def get_chat_member(self, chat_id: Union[int, str], user_id: int) -> ChatMember:
        # MAX middleware может принимать chat_id в нескольких форматах:
        # с лидирующим минусом, без него, либо @username. Перебираем их все,
        # чтобы не зависить от того, как именно числовой ID попал в конфиг.
        candidates: List[str] = []
        cid_raw = str(chat_id)
        if cid_raw.startswith("-"):
            candidates.append(cid_raw)              # -76101625559782
            candidates.append(cid_raw.lstrip("-"))  # 76101625559782
        elif cid_raw.startswith("@"):
            candidates.append(cid_raw)               # @username
            candidates.append(cid_raw.lstrip("@"))
        else:
            candidates.append(cid_raw)
            candidates.append(cid_raw.lstrip("@"))
        # Уникальные без повторов
        seen: Set[str] = set()
        paths: List[str] = []
        for c in candidates:
            if c and c not in seen:
                seen.add(c)
                paths.append(c)

        for cid in paths:
            try:
                resp = await self._http_client.get(
                    f"/chats/{cid}/members",
                    params={"user_id": user_id},
                )
            except Exception as e:
                logger.warning(f"get_chat_member request fail chat={cid}: {e}")
                continue
            logger.info(f"get_chat_member: chat={cid} user={user_id} resp={str(resp)[:400]}")
            resp = self._normalize_response(resp)
            if not resp.get("ok"):
                continue
            members = resp.get("result")
            if members is None:
                continue
            # Обработка обёрток {"members": [...], "result": [...], "items": [...]}
            if isinstance(members, dict):
                for key in ("members", "membership", "list", "items", "result"):
                    val = members.get(key)
                    if isinstance(val, list):
                        members = val
                        break
            # Нормализация: каждый элемент может быть
            #   {"user": {"id": N}, "status": ...}
            #   {"user_id": N, "status": ...}
            def _member_uid(m: dict) -> Optional[int]:
                u = m.get("user")
                if isinstance(u, dict):
                    return u.get("id") or u.get("user_id")
                return m.get("id") or m.get("user_id")

            def _member_status(m: dict) -> str:
                st = m.get("status") or m.get("role") or m.get("type") or ""
                if isinstance(st, str):
                    return st
                return str(st)

            if isinstance(members, list):
                for m in members:
                    if not isinstance(m, dict):
                        continue
                    if _member_uid(m) != user_id:
                        continue
                    data = dict(m)
                    status = _member_status(data)
                    # Если статус нестандартный, но есть is_member/подписка —
                    # считаем пользователя участником канала.
                    if data.get("is_member") or data.get("subscribed"):
                        data.setdefault("status", "member")
                    if status in ("member", "administrator", "creator",
                                  "owner", "subscriber", "subscribed"):
                        data["status"] = "member"
                    if not data.get("status"):
                        data["status"] = "member"
                    return ChatMember(data)
            elif isinstance(members, dict):
                m = members
                if _member_uid(m) != user_id:
                    continue
                data = dict(m)
                if data.get("is_member") or data.get("subscribed"):
                    data.setdefault("status", "member")
                if not data.get("status"):
                    data["status"] = "member"
                return ChatMember(data)
            # Не нашли в этом варианте — пробуем следующий формат chat_id.
        logger.warning(f"get_chat_member: user={user_id} not found/left in chat {cid_raw}")
        return ChatMember({"status": "left", "user": {"id": user_id}})

    async def get_file(self, file_id: str) -> Optional[File]:
        raw_id, direct_url = self._resolve_photo_ref(file_id)
        logger.debug(f"get_file: calling /files/{str(raw_id)[:50]} (original={str(file_id)[:50]})")
        resp = await self._http_client.get(f"/files/{raw_id}")
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            result = resp["result"]
            if isinstance(result, dict):
                logger.debug(f"get_file: /files response keys={list(result.keys())}")
            f = File(result, bot=self)
            if f.file_path:
                logger.info(f"get_file: got file_path={str(f.file_path)[:80]}")
                return f
            logger.debug(f"get_file: no file_path in response")
        elif resp.get("ok"):
            logger.debug(f"get_file: /files ok but no result field")
        else:
            logger.debug(f"get_file: /files failed: {resp.get('error', resp)}")
        # Fallback: use direct URL from JSON payload as file_path
        if direct_url:
            logger.info(f"get_file: using direct_url as file_path: {direct_url[:80]}")
            return File({"file_id": raw_id, "file_path": direct_url}, bot=self)
        logger.debug(f"get_file: no direct_url either, raw_id={str(raw_id)[:50] if raw_id else None}")
        return File({"file_id": raw_id}, bot=self)

    async def get_me(self) -> User:
        if self._me:
            return self._me
        resp = await self._http_client.get("/me")
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            self._me = User.from_dict(resp["result"])
            return self._me
        return User(id=0)

    async def get_chat(self, chat_id: Union[int, str]) -> Optional[Chat]:
        cid = str(chat_id).lstrip("@-") if isinstance(chat_id, str) else str(chat_id)
        resp = await self._http_client.get(f"/chats/{cid}")
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            return Chat.from_dict(resp["result"])
        return None

    async def get_chat_member_count(self, chat_id: Union[int, str]) -> int:
        cid = str(chat_id).lstrip("@-") if isinstance(chat_id, str) else str(chat_id)
        resp = await self._http_client.get(f"/chats/{cid}/members")
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            members = resp["result"]
            if isinstance(members, list):
                return len(members)
        return 0

    async def get_message(self, chat_id: Union[int, str], message_id: Union[int, str]) -> Optional[dict]:
        params = self._chat_params(chat_id)
        resp = await self._http_client.get(f"/messages/{message_id}", params=params)
        resp = self._normalize_response(resp)
        if resp.get("ok") and resp.get("result"):
            return resp["result"]
        return None

    async def set_my_commands(self, commands: List[BotCommand]) -> bool:
        return True

    async def delete_my_commands(self) -> bool:
        return True

    async def set_chat_menu_button(self, menu_button: MenuButtonCommands = None) -> bool:
        return True

    async def set_webhook(self, url: str, secret: str = "") -> dict:
        data = {"url": url, "update_types": ["message_created", "bot_started"]}
        if secret:
            data["secret"] = secret
        return await self._http_client.post("/subscriptions", json_data=data)

    async def delete_webhook(self) -> dict:
        resp = await self._http_client.get("/subscriptions")
        subs = resp.get("subscriptions", []) if isinstance(resp, dict) else []
        deleted = []
        for sub in subs:
            url = sub.get("url", "")
            if url:
                result = await self._http_client.delete("/subscriptions", params={"url": url})
                deleted.append({"url": url, "success": result.get("success", False)})
        return {"ok": True, "deleted": deleted}


class BaseHandler:
    def check_update(self, update: Update) -> bool:
        return False

    async def handle(self, update: Update, context: Context) -> Any:
        return None


class CommandHandler(BaseHandler):
    def __init__(self, command: str, callback: Callable):
        self.command = command.lower()
        self.callback = callback

    def check_update(self, update: Update) -> bool:
        if not update.message or not update.message.text:
            return False
        text = update.message.text.strip().split()
        if not text:
            return False
        cmd = text[0].lower()
        if cmd == f"/{self.command}":
            return True
        at_pos = cmd.find("@")
        if at_pos > 0 and cmd[:at_pos] == f"/{self.command}":
            return True
        return False

    async def handle(self, update: Update, context: Context) -> Any:
        if update.message and update.message.text:
            parts = update.message.text.strip().split()
            context.args = parts[1:] if len(parts) > 1 else []
        return await self.callback(update, context)


class MessageHandler(BaseHandler):
    def __init__(self, filters: _Filter, callback: Callable):
        self.filters = filters
        self.callback = callback

    def check_update(self, update: Update) -> bool:
        return self.filters(update)

    async def handle(self, update: Update, context: Context) -> Any:
        return await self.callback(update, context)


class CallbackQueryHandler(BaseHandler):
    def __init__(self, callback: Callable, pattern: Optional[str] = None):
        self.callback = callback
        self.pattern = re.compile(pattern) if pattern else None

    def check_update(self, update: Update) -> bool:
        if not update.callback_query:
            return False
        if self.pattern:
            data = update.callback_query.data or ""
            return bool(self.pattern.match(data))
        return True

    async def handle(self, update: Update, context: Context) -> Any:
        return await self.callback(update, context)


class TypeHandler(BaseHandler):
    def __init__(self, type: Type, callback: Callable):
        self.type = type
        self.callback = callback

    def check_update(self, update: Update) -> bool:
        return isinstance(update, self.type)

    async def handle(self, update: Update, context: Context) -> Any:
        return await self.callback(update, context)


class ConversationHandler(BaseHandler):
    END = object()

    def __init__(self, entry_points: List[BaseHandler], states: Dict[Any, List[BaseHandler]], fallbacks: List[BaseHandler]):
        self.entry_points = entry_points
        self.states = states
        self.fallbacks = fallbacks

    def _get_user_id(self, update: Update) -> Optional[int]:
        user = update.effective_user
        return user.id if user else None

    def check_update(self, update: Update) -> bool:
        return True

    async def handle(self, update: Update, context: Context) -> Any:
        user_id = self._get_user_id(update)
        if user_id is None:
            return None

        state = context.user_data.get("_conversation_state")
        if state is None:
            for handler in self.entry_points:
                if handler.check_update(update):
                    result = await handler.handle(update, context)
                    if result is self.END:
                        context.user_data.pop("_conversation_state", None)
                        return self.END
                    if result is not None:
                        context.user_data["_conversation_state"] = result
                    return result
            return None

        state_handlers = self.states.get(state, [])
        for handler in state_handlers:
            if handler.check_update(update):
                result = await handler.handle(update, context)
                if result is self.END:
                    context.user_data.pop("_conversation_state", None)
                    return self.END
                if result is not None:
                    context.user_data["_conversation_state"] = result
                return result

        for handler in self.fallbacks:
            if handler.check_update(update):
                result = await handler.handle(update, context)
                if result is self.END:
                    context.user_data.pop("_conversation_state", None)
                    return self.END
                if result is not None:
                    context.user_data["_conversation_state"] = result
                return result

        return None


class ApplicationBuilder:
    def __init__(self):
        self._token: Optional[str] = None
        self._post_init: Optional[Callable] = None
        self._persistence_path: Optional[str] = None

    def token(self, token: str) -> "ApplicationBuilder":
        self._token = token
        return self

    def post_init(self, fn: Callable) -> "ApplicationBuilder":
        self._post_init = fn
        return self

    def persistence_path(self, path: str) -> "ApplicationBuilder":
        self._persistence_path = path
        return self

    def build(self) -> "Application":
        if not self._token:
            raise ValueError("token is required")
        return Application(token=self._token, post_init=self._post_init,
                            persistence_path=self._persistence_path)


class Updater:
    def __init__(self, application: "Application"):
        self.application = application
        self._polling_task: Optional[asyncio.Task] = None
        self._running = False
        self._marker = 0
        self._update_seq = 0

    async def start_polling(self, allowed_updates: Optional[List[str]] = None, **kwargs):
        if self._running:
            return
        self._running = True
        self._polling_task = asyncio.create_task(self._polling_loop(allowed_updates))
        logger.info("Polling started")

    async def stop(self):
        self._running = False
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
            self._polling_task = None
        logger.info("Polling stopped")

    @staticmethod
    def _extract_user(update: dict) -> dict:
        user = update.get("user") or {}
        if not user:
            cb = update.get("callback") or {}
            user = cb.get("user") or {}
        return {
            "id": user.get("user_id", user.get("id", 0)),
            "is_bot": user.get("is_bot", False),
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name"),
            "username": user.get("username"),
            "language_code": user.get("language_code"),
        }

    @staticmethod
    def _extract_user_from_message(message: dict) -> dict:
        sender = message.get("sender") or message.get("from") or {}
        return {
            "id": sender.get("user_id", sender.get("id", 0)),
            "is_bot": sender.get("is_bot", False),
            "first_name": sender.get("first_name", ""),
            "last_name": sender.get("last_name"),
            "username": sender.get("username"),
            "language_code": sender.get("language_code"),
        }

    @staticmethod
    def _build_chat(chat_id: int, user: dict = None, is_channel: bool = False) -> dict:
        if is_channel:
            return {"id": chat_id, "type": "channel", "title": user.get("title", "Channel")}
        return {
            "id": chat_id,
            "type": "private",
            "first_name": user.get("first_name", ""),
            "last_name": user.get("last_name"),
            "username": user.get("username"),
        }

    def _extract_message_body(self, message: dict) -> tuple:
        body = message.get("body") or {}
        text = body.get("text") or body.get("caption") or message.get("text") or message.get("caption")
        attachments = body.get("attachments") or message.get("attachments") or []
        caption = body.get("caption") or message.get("caption")
        return text, caption, attachments

    def _normalize_max_update(self, raw: dict) -> Optional[dict]:
        update_type = raw.get("update_type", "")
        user_obj = raw.get("user") or {}
        message_data = raw.get("message") or {}
        sender = message_data.get("sender") or {}
        recipient = message_data.get("recipient") or {}
        raw_chat_id = raw.get("chat_id", 0)
        # For message_callback, user info is inside callback.user
        raw_callback = raw.get("callback") or {}
        callback_user = raw_callback.get("user") if isinstance(raw_callback, dict) else {}
        if callback_user:
            user_obj = callback_user
        recipient_uid = recipient.get("user_id") or recipient.get("id", 0)
        user_id = (user_obj.get("user_id") or user_obj.get("id") or
                   sender.get("user_id") or sender.get("id") or
                   recipient_uid or 0)
        chat_id = user_id or raw_chat_id
        if not chat_id and isinstance(raw_callback, dict):
            chat_id = raw_callback.get("user", {}).get("user_id", 0)
        logger.info(f"_normalize_max_update: type={update_type} raw_chat_id={raw.get('chat_id')} user_obj={user_obj} sender={sender} recipient_uid={recipient_uid} computed_chat_id={chat_id}")
        timestamp_ms = raw.get("timestamp", 0)
        timestamp_s = timestamp_ms // 1000 if timestamp_ms > 1e12 else timestamp_ms
        is_channel = raw.get("is_channel", False)
        user_data = self._extract_user(raw)
        # If user_data is empty (callback case), build from recipient
        if not user_data.get("id") and recipient_uid:
            user_data = {
                "id": recipient_uid,
                "is_bot": False,
                "first_name": recipient.get("first_name", ""),
                "last_name": recipient.get("last_name"),
                "username": recipient.get("username"),
            }
        message_data = raw.get("message")

        self._update_seq += 1
        seq = self._update_seq

        if update_type == "bot_started":
            chat = self._build_chat(chat_id, user_data, is_channel)
            # MAX может передавать payload deep link в разных полях
            start_payload = (
                raw.get("payload")
                or (message_data or {}).get("text")
                or raw.get("start_payload")
                or raw.get("callback_data", "")
            )
            start_text = "/start"
            if start_payload and start_payload.strip():
                start_text = f"/start {start_payload.strip()}"
            logger.info(f"bot_started: chat_id={chat_id} payload={start_payload!r}")
            return {
                "update_id": seq,
                "message": {
                    "message_id": seq,
                    "from": user_data,
                    "chat": chat,
                    "date": timestamp_s,
                    "text": start_text,
                },
            }

        if update_type == "bot_stopped":
            chat = self._build_chat(chat_id, user_data, is_channel)
            return {
                "update_id": seq,
                "message": {
                    "message_id": seq,
                    "from": user_data,
                    "chat": chat,
                    "date": timestamp_s,
                    "text": "/stop",
                },
            }

        if update_type == "message_created" and message_data:
            msg_id = message_data.get("id", seq)
            sender = self._extract_user_from_message(message_data)
            text, caption, attachments = self._extract_message_body(message_data)
            chat = self._build_chat(chat_id, sender, is_channel)

            has_photo_attachments = any(
                a.get("type") in ("image", "photo") for a in attachments
            )

            result = {
                "update_id": seq,
                "message": {
                    "message_id": msg_id,
                    "from": sender,
                    "chat": chat,
                    "date": timestamp_s,
                },
            }
            if caption:
                result["message"]["caption"] = caption
                result["message"]["text"] = caption
            elif text:
                result["message"]["text"] = text

            if has_photo_attachments:
                photo_list = []
                for a in attachments:
                    if a.get("type") in ("image", "photo"):
                        payload = a.get("payload")
                        if payload:
                            fid = json.dumps(payload)
                        else:
                            fid = a.get("file_id", "")
                        photo_list.append({"file_id": fid, "width": 0, "height": 0})
                result["message"]["photo"] = photo_list
            if text:
                result["message"]["text"] = text
            return result

        if update_type == "message_edited" and message_data:
            msg_id = message_data.get("id", seq)
            sender = self._extract_user_from_message(message_data)
            text, caption, _ = self._extract_message_body(message_data)
            chat = self._build_chat(chat_id, sender, is_channel)
            result = {
                "update_id": seq,
                "edited_message": {
                    "message_id": msg_id,
                    "from": sender,
                    "chat": chat,
                    "date": timestamp_s,
                    "edit_date": timestamp_s,
                },
            }
            if text:
                result["edited_message"]["text"] = text
            if caption:
                result["edited_message"]["caption"] = caption
            return result

        if update_type == "message_callback":
            raw_callback = raw.get("callback", {})
            callback_data = ""
            callback_id = ""
            if isinstance(raw_callback, dict):
                callback_data = raw_callback.get("payload", raw_callback.get("callback_data", ""))
                callback_id = raw_callback.get("callback_id", "")
            if not callback_data:
                callback_data = raw.get("callback_data", raw.get("payload", ""))
            if not callback_id:
                callback_id = raw.get("callback_id", str(seq))
            msg_id = seq
            cb_msg = None
            if message_data:
                msg_id = message_data.get("id", seq)
                sender = self._extract_user_from_message(message_data)
                text, caption, _ = self._extract_message_body(message_data)
                cb_msg = {
                    "message_id": msg_id,
                    "from": sender,
                    "chat": self._build_chat(chat_id, sender, is_channel),
                    "date": timestamp_s,
                }
                if text:
                    cb_msg["text"] = text
                if caption:
                    cb_msg["caption"] = caption
            return {
                "update_id": seq,
                "callback_query": {
                    "id": callback_id or str(msg_id),
                    "from": user_data,
                    "message": cb_msg,
                    "data": callback_data,
                    "chat_instance": str(chat_id),
                },
            }

        if update_type == "message_removed":
            msg_id = (message_data or {}).get("id", seq)
            chat = self._build_chat(chat_id, user_data, is_channel)
            sender = self._extract_user_from_message(message_data) if message_data else user_data
            return {
                "update_id": seq,
                "message": {
                    "message_id": msg_id,
                    "from": sender,
                    "chat": chat,
                    "date": timestamp_s,
                    "text": "",
                },
            }

        logger.debug(f"Unknown update_type: {update_type}, data: {raw}")
        return None

    async def _polling_loop(self, allowed_updates: Optional[List[str]] = None):
        bot = self.application.bot
        error_backoff = 30.0
        while self._running:
            try:
                params: Dict[str, Any] = {
                    "marker": self._marker if self._marker else None,
                    "timeout": POLLING_TIMEOUT,
                    "types": "bot_started,bot_stopped,message_created,message_edited,message_callback,message_removed",
                }

                try:
                    resp = await bot._http_client.request("GET", "/updates", params=params, retries=1)
                except Exception as e:
                    logger.warning(f"getUpdates exception: {e}")
                    await asyncio.sleep(error_backoff)
                    error_backoff = min(error_backoff * 2, 60)
                    continue

                if not isinstance(resp, dict):
                    await asyncio.sleep(POLLING_INTERVAL)
                    continue

                updates_data = None
                if isinstance(resp.get("updates"), list):
                    updates_data = resp["updates"]
                elif resp.get("ok") and isinstance(resp.get("result"), list):
                    updates_data = resp["result"]
                elif isinstance(resp, list):
                    updates_data = resp
                elif isinstance(resp.get("result"), list):
                    updates_data = resp["result"]

                marker = resp.get("marker")
                if marker is not None:
                    self._marker = marker

                if not updates_data:
                    logger.info(f"Polling: no updates (marker={self._marker})")
                    error_msg = resp.get("error", "")
                    if not resp.get("ok") and "error" in resp:
                        is_ratelimit = "rate_limited" in error_msg or "429" in error_msg
                        backoff = error_backoff if is_ratelimit else error_backoff
                        logger.warning(f"getUpdates error: {resp.get('error')} (retry in {backoff}s)")
                        await asyncio.sleep(backoff)
                        error_backoff = min(backoff * 2, 300)
                    else:
                        error_backoff = POLLING_INTERVAL
                        await asyncio.sleep(POLLING_INTERVAL)
                    continue

                error_backoff = POLLING_INTERVAL

                update_count = len(updates_data)
                if update_count:
                    logger.info(f"Received {update_count} update(s)")

                for raw in updates_data:
                    try:
                        logger.info(f"Raw update: type={raw.get('update_type')} chat_id={raw.get('chat_id')} user={raw.get('user', {})} callback={raw.get('callback', 'N/A')}")
                        tg_update = self._normalize_max_update(raw)
                        if tg_update:
                            await self.application._process_update_raw(tg_update)
                    except Exception as e:
                        logger.error(f"Error processing update: {e}", exc_info=True)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Polling error: {e}", exc_info=True)
                await asyncio.sleep(POLLING_INTERVAL)


class Application:
    def __init__(self, token: str, post_init: Optional[Callable] = None,
                 persistence_path: Optional[str] = None):
        self.bot = Bot(token)
        self.job_queue = JobQueue()
        self.updater = Updater(self)
        self._handlers: Dict[int, List[BaseHandler]] = {}
        self._error_handlers: List[Callable] = []
        self._post_init = post_init
        self._user_data: Dict[int, dict] = {}
        self._chat_data: Dict[int, dict] = {}
        self._bot_data: dict = {}
        self._initialized = False
        # Без этого context.user_data (флаги "жду код", "создаю объявление"
        # и т.п.) живёт только в памяти процесса — при рестарте/редеплое
        # контейнера всё мгновенно обнуляется, и следующее сообщение от
        # пользователя (например, код верификации) проваливается в
        # обработчик по умолчанию, как будто бот "забыл", чего ждал.
        self._persistence_path = persistence_path
        self._persistence_task: Optional[asyncio.Task] = None
        if self._persistence_path:
            self._load_persistence()

    @staticmethod
    def builder() -> ApplicationBuilder:
        return ApplicationBuilder()

    def _load_persistence(self):
        try:
            if os.path.exists(self._persistence_path):
                with open(self._persistence_path, "rb") as f:
                    data = pickle.load(f)
                self._user_data = data.get("user_data", {})
                self._chat_data = data.get("chat_data", {})
                self._bot_data = data.get("bot_data", {})
                logger.info(
                    f"Persistence: загружено user_data для {len(self._user_data)} "
                    f"пользователей из {self._persistence_path}"
                )
        except Exception as e:
            logger.warning(f"Persistence: не удалось загрузить {self._persistence_path}: {e}")

    def _flush_persistence(self):
        if not self._persistence_path:
            return
        try:
            data = {
                "user_data": self._user_data,
                "chat_data": self._chat_data,
                "bot_data": self._bot_data,
            }
            # Атомарная запись через временный файл + rename — чтобы падение
            # процесса посреди записи не оставило битый/обрезанный файл
            # (та же логика, что и с повреждением SQLite на этом томе).
            tmp_path = f"{self._persistence_path}.tmp"
            with open(tmp_path, "wb") as f:
                pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
            os.replace(tmp_path, self._persistence_path)
        except Exception as e:
            logger.warning(f"Persistence: не удалось сохранить {self._persistence_path}: {e}")

    async def _persistence_loop(self, interval: int = 20):
        try:
            while True:
                await asyncio.sleep(interval)
                self._flush_persistence()
        except asyncio.CancelledError:
            self._flush_persistence()
            raise

    def add_handler(self, handler: BaseHandler, group: int = 0):
        if group not in self._handlers:
            self._handlers[group] = []
        self._handlers[group].append(handler)

    def add_error_handler(self, callback: Callable):
        self._error_handlers.append(callback)

    async def initialize(self):
        if not self._initialized:
            self.job_queue._set_application(self)
            if self._post_init:
                await self._post_init(self)
            self._initialized = True

    async def start(self):
        self.job_queue.start()
        if self._persistence_path:
            self._persistence_task = asyncio.create_task(self._persistence_loop())

    async def stop(self):
        self.job_queue.stop()
        await self.updater.stop()
        if self._persistence_task:
            self._persistence_task.cancel()
            try:
                await self._persistence_task
            except asyncio.CancelledError:
                pass
            self._persistence_task = None
        self._flush_persistence()
        await self.bot.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def _process_update(self, update: Update):
        context = Context(self, update)

        sorted_groups = sorted(self._handlers.keys())
        handled = False

        for group in sorted_groups:
            for handler in self._handlers[group]:
                try:
                    if handler.check_update(update):
                        result = await handler.handle(update, context)
                        handled = True
                        if isinstance(handler, (CommandHandler, MessageHandler, CallbackQueryHandler)):
                            if result is not None:
                                return
                        elif isinstance(handler, ConversationHandler):
                            return
                        elif isinstance(handler, TypeHandler):
                            if result is not None:
                                return
                except Exception as e:
                    await self._handle_error(update, context, e)
                    handled = True

    async def _process_update_raw(self, raw: dict) -> None:
        for field in ("message", "edited_message", "channel_post", "edited_channel_post"):
            if field in raw and isinstance(raw[field], dict) and "id" in raw[field] and "message_id" not in raw[field]:
                raw[field]["message_id"] = raw[field].pop("id")
        if "callback_query" in raw and isinstance(raw.get("callback_query"), dict):
            cq = raw["callback_query"]
            if "message" in cq and isinstance(cq["message"], dict) and "id" in cq["message"] and "message_id" not in cq["message"]:
                cq["message"]["message_id"] = cq["message"].pop("id")
        try:
            update = Update.from_dict(raw, bot=self.bot)
            update._set_bot(self.bot)
            await self._process_update(update)
        except Exception as e:
            logger.error(f"Error processing update: {e}", exc_info=True)

    async def process_update_data(self, data: dict) -> None:
        raw = data
        if "message" in raw and isinstance(raw.get("message"), dict):
            msg = raw["message"]
            if "id" in msg and "message_id" not in msg:
                msg["message_id"] = msg.pop("id")
        if "callback_query" in raw and isinstance(raw.get("callback_query"), dict):
            cq = raw["callback_query"]
            if "message" in cq and isinstance(cq["message"], dict) and "id" in cq["message"] and "message_id" not in cq["message"]:
                cq["message"]["message_id"] = cq["message"].pop("id")
        try:
            update = Update.from_dict(raw, bot=self.bot)
            update._set_bot(self.bot)
            await self._process_update(update)
        except Exception as e:
            logger.error(f"Error processing webhook update: {e}", exc_info=True)

    async def run_polling(self):
        await self.initialize()
        await self.start()
        await self.updater.start_polling(allowed_updates=Update.ALL_TYPES)

        stop_event = asyncio.Event()
        try:
            await stop_event.wait()
        except (KeyboardInterrupt, SystemExit):
            pass
        finally:
            await self.updater.stop()
            await self.stop()

    async def _handle_error(self, update: Update, context: Context, error: Exception):
        context._error = error
        for handler in self._error_handlers:
            try:
                await handler(update, context)
            except Exception as e:
                logger.error(f"Error in error handler: {e}", exc_info=True)
