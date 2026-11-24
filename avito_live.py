"""avito_live — мониторинг новых объявлений Авито по готовой ссылке с фильтрами.

Независимый модуль: свой файл БД, свой цикл опроса, своя отправка в Telegram.
Со старым парсером и таблицами бота не пересекается.

Как это работает
  1. Пользователь даёт ссылку с фильтрами -> normalize_url() принудительно
     включает сортировку «по дате» (s=104).
  2. Раз в N секунд (с разбросом) страница выдачи скачивается через curl_cffi
     с TLS-отпечатком Chrome (через прокси, если заданы).
  3. Из JSON состояния страницы (data-mfe-state → catalog.items) достаются
     объявления ТОЛЬКО основной выдачи; «похожие» (extraBlockItems) не берутся.
     Всё, что ещё не видели для этой подписки, уходит пользователю. Самый
     первый опрос подписки только запоминает выдачу и ничего не шлёт.
  4. Одинаковые ссылки разных пользователей скачиваются один раз.

Окружение (все необязательно)
  AVITO_PROXIES       прокси через запятую: socks5h://user:pass@host:port,...
  AVITO_PROXY_ROTATE_URL  ссылка смены IP мобильного прокси у провайдера
  AVITO_TRIES        сколько раз пробовать страницу со сменой IP, по умолчанию 3
  AVITO_TIMEOUT      таймаут запроса, секунды (мобильный прокси медленный)
  AVITO_POLL_SEC      период опроса одной ссылки, по умолчанию 120
                      (20 с на одном прокси нереально: Авито режет)
  AVITO_CONCURRENCY   сколько ссылок качать одновременно, по умолчанию 1
  AVITO_LIVE_MAX      лимит подписок на пользователя, по умолчанию 3
  AVITO_LIVE_DB       путь к sqlite-файлу
  AVITO_IMPERSONATE   профиль curl_cffi, по умолчанию edge101
"""
from __future__ import annotations

import asyncio
import html as _html
import json
import logging
import os
import random
import re
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlparse, urlunparse

log = logging.getLogger("avito_live")

SORT_NEWEST = "104"
ALLOWED_HOSTS = {"avito.ru", "www.avito.ru", "m.avito.ru"}
BLOCK_MARKERS = ("доступ ограничен", "проблема с ip", "firewall", "captcha", "подтвердите, что вы не робот")
BLOCK_CODES = (403, 429, 439)   # 439 — отдельный код антибота Авито (в логах старого сборщика)
MAX_BURST = 10              # больше новых за один опрос -> шлём только самые свежие
MAX_AGE_SEC = 6 * 3600      # объявления старше этого не шлём (всплывшие после сбоя)
SEEN_TTL_SEC = 30 * 86400


class Blocked(Exception):
    """Авито отдал блокировку/капчу (403/429/страница «доступ ограничен»)."""


class FetchError(Exception):
    """Сетевая ошибка или нераспознанная страница."""


class NoProxy(Exception):
    """Все прокси в паузе после блокировок — это не блокировка Авито."""


# --------------------------------------------------------------------------
# Ссылки и разбор страницы
# --------------------------------------------------------------------------

def normalize_url(raw: str) -> Optional[str]:
    """Проверяет ссылку на выдачу Авито и включает сортировку по дате."""
    m = re.search(r"https?://\S+", raw or "")
    if not m:
        return None
    try:
        u = urlparse(m.group(0).rstrip(").,;"))
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    if u.scheme not in ("http", "https") or host not in ALLOWED_HOSTS:
        return None
    if u.path in ("", "/"):
        return None
    params = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
              if k not in ("s", "p", "localPriority")]
    params.append(("s", SORT_NEWEST))
    query = urlencode(params, quote_via=quote, safe=",:")
    return urlunparse(("https", "www.avito.ru", u.path, "", query, ""))


def watch_title(url: str) -> str:
    u = urlparse(url)
    q = dict(parse_qsl(u.query))
    if q.get("q"):
        return q["q"][:60]
    parts = [p for p in u.path.split("/") if p]
    return " / ".join(parts[:3])[:60] or "Авито"


@dataclass
class Listing:
    id: int
    title: str
    price: int
    url: str
    image: Optional[str] = None
    location: str = ""
    description: str = ""
    ts: Optional[float] = None      # секунды unix, если Авито отдал время

    def age(self) -> Optional[float]:
        return None if self.ts is None else time.time() - self.ts


@dataclass
class Page:
    items: List[Listing]
    recognized: bool                # удалось распарсить __initialData__


_INIT_RE = re.compile(r'window\.__initialData__\s*=\s*"((?:[^"\\]|\\.)*)"')
# Новый формат (ноябрь 2026): window.__INITIALDATA__ = {...} — обычный JSON,
# не строка. Старый regex его не видел, и страница считалась нераспознанной.
_INIT_OBJ_RE = re.compile(r'window\.__initialdata__\s*=\s*', re.I)


_INIT_SCRIPT_RE = re.compile(
    r'<script[^>]*id=["\']__INITIALDATA__["\'][^>]*>(.*?)</script>', re.I | re.S)


_INIT_JSON_BLOCK_RE = re.compile(
    r'<script[^>]*(?:id|data-name)=["\']__INITIALDATA__["\'][^>]*>(.*?)</script>',
    re.I | re.S)
_INIT_PARSE_RE = re.compile(
    r'window\.__initialdata__\s*=\s*JSON\.parse\(\s*"((?:[^"\\]|\\.)*)"\s*\)',
    re.I | re.S)
_INIT_STR_RE = re.compile(
    r'window\.__initialdata__\s*=\s*"((?:[^"\\]|\\.)*)"', re.I | re.S)


def _initialdata_obj(text: str):
    t = text or ""
    # 1) <script id="__INITIALDATA__" type="application/json">{...}</script>
    m = _INIT_JSON_BLOCK_RE.search(t)
    if m:
        raw = _html.unescape(m.group(1)).strip()
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return None
    # 2) window.__INITIALDATA__ = JSON.parse("…")
    m = _INIT_PARSE_RE.search(t)
    if m:
        try:
            inner = json.loads('"' + m.group(1) + '"')
            for cand in (inner, unquote(inner)):
                try:
                    return json.loads(cand)
                except (ValueError, TypeError):
                    continue
        except (ValueError, TypeError):
            pass
    # 3) window.__INITIALDATA__ = "…" (строка, возможно URL-энкод)
    m = _INIT_STR_RE.search(t)
    if m:
        try:
            inner = json.loads('"' + m.group(1) + '"')
            for cand in (inner, unquote(inner)):
                try:
                    return json.loads(cand)
                except (ValueError, TypeError):
                    continue
        except (ValueError, TypeError):
            pass
    # 4) window.__INITIALDATA__ = {…}
    m = _INIT_OBJ_RE.search(t)
    if not m:
        return None
    rest = t[m.end():].lstrip()
    if rest.startswith('"'):
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(rest)
        return obj
    except (ValueError, TypeError):
        return None


def _looks_like_item(d: dict) -> bool:
    i = d.get("id")
    ok_id = isinstance(i, int) or (isinstance(i, str) and i.isdigit())
    return ok_id and isinstance(d.get("title"), str) and isinstance(d.get("urlPath"), str)


def _walk(o: Any, out: List[dict], depth: int = 0) -> None:
    if depth > 40:
        return
    if isinstance(o, dict):
        if _looks_like_item(o):
            out.append(o)
            return
        for v in o.values():
            _walk(v, out, depth + 1)
    elif isinstance(o, list):
        for v in o:
            _walk(v, out, depth + 1)


_JUNK_WORDS = (
    "дисплей", "экран", "аккумулятор", "стекло", "чехол", "кабель", "зарядк",
    "корпус", "шлейф", "камер", "кнопк", "рамк", "запчаст", "крышк", "держател",
    "адаптер", "переходник", "наушник", "плёнк", "пленк", "бампер", "стилус",
    # Мусор, который часто маскируется под «дешёвый лот»:
    "донор", "на запчаст", "не работает", "не включается", "разбит", "трещин",
    "ремонт", "прошив", "разблок", "копия", "реплика", "пустая коробка",
    "только коробка", "лоток", "блок питания", "повербанк", "power bank",
    "подставк", "объектив", "плата", "батаре", "защитн", "чехол-",
)


def _is_junk_title(title: str) -> bool:
    low = (title or "").lower()
    return any(w in low for w in _JUNK_WORDS)


def _price(d: dict) -> int:
    pd = d.get("priceDetailed")
    if isinstance(pd, dict) and isinstance(pd.get("value"), (int, float)):
        return int(pd["value"])
    p = d.get("price")
    if isinstance(p, (int, float)):
        return int(p)
    if isinstance(p, str):
        digits = re.sub(r"\D", "", p)
        return int(digits) if digits else 0
    return 0


def _image(d: dict) -> Optional[str]:
    imgs = d.get("images")
    if not (isinstance(imgs, list) and imgs):
        return None
    first = imgs[0]
    if isinstance(first, str) and first.startswith("http"):
        return first
    if isinstance(first, dict):
        best, best_area = None, -1
        for k, v in first.items():
            if isinstance(v, str) and v.startswith("http"):
                m = re.match(r"(\d+)x(\d+)", str(k))
                area = int(m.group(1)) * int(m.group(2)) if m else 0
                if area > best_area:
                    best, best_area = v, area
        return best
    return None


def _location(d: dict) -> str:
    loc = d.get("location")
    if isinstance(loc, dict) and loc.get("name"):
        return str(loc["name"])
    addr = d.get("addressDetailed")
    if isinstance(addr, dict) and addr.get("locationName"):
        return str(addr["locationName"])
    geo = d.get("geo")
    if isinstance(geo, dict) and geo.get("formattedAddress"):
        return str(geo["formattedAddress"])
    return ""


# --- Состояние страницы ---------------------------------------------------
# С ноября 2026 Авито кладёт данные выдачи в <script type="mime/invalid"
# data-mfe-state="true">. Внутри — JSON: loaderData.data.catalog.items это
# ТОЛЬКО основная выдача, «похожие» лежат отдельно в extraBlockItems.
# Старый window.__initialData__ оставлен как запасной путь.

_MFE_RE = re.compile(r'<script[^>]*data-mfe-state[^>]*>(.*?)</script>',
                     re.S | re.I)


def _mfe_catalog_items(page_html: str) -> Optional[List[dict]]:
    m = _MFE_RE.search(page_html or "")
    if not m:
        return None
    try:
        state = json.loads(m.group(1))
    except (ValueError, TypeError):
        return None
    try:
        items = state["loaderData"]["data"]["catalog"]["items"]
    except (KeyError, TypeError):
        return None
    return items if isinstance(items, list) else None


def _cut_extra(page_html: str) -> str:
    """Обрезает страницу перед блоком «похожих» (extraBlockItems в разметке)."""
    m = re.search(r'<div class="items-[^"]*">\s*<div class="extra-', page_html or "")
    return page_html[:m.start()] if m else page_html


# --- Микроразметка выдачи -------------------------------------------------
# Последний запасной путь: если ни JSON состояния, ни __initialData__ нет.
# Это тот же путь, которым годами пользовался старый сборщик.

def _micro_prop(chunk: str, name: str, attr: str = "content") -> str:
    m = re.search(r'itemProp="%s"[^>]*?%s="([^"]*)"' % (name, attr), chunk, re.I)
    if m:
        return _html.unescape(m.group(1))
    m = re.search(r'%s="([^"]*)"[^>]*?itemProp="%s"' % (attr, name), chunk, re.I)
    return _html.unescape(m.group(1)) if m else ""


def _hours_ago(text: str) -> Optional[float]:
    """«1 час назад» / «вчера» / «7 дней назад» → часы. None — не разобрали."""
    t = str(text or "").lower().replace("\xa0", " ").strip()
    if not t:
        return None
    if "сегодня" in t or "минут" in t or "только что" in t or "сейчас" in t:
        return 0.0
    if "вчера" in t:
        return 24.0
    m = re.search(r"(\d+)?\s*(минут|час|день|дня|дней|сут|недел|месяц|год)", t)
    if not m:
        return None
    n = int(m.group(1)) if m.group(1) else 1
    unit = m.group(2)
    if unit.startswith("минут"):
        return 0.0
    if unit.startswith("час"):
        return float(n)
    if unit.startswith(("день", "дня", "дней", "сут")):
        return n * 24.0
    if unit.startswith("недел"):
        return n * 168.0
    if unit.startswith("месяц"):
        return n * 720.0
    if unit.startswith("год"):
        return n * 8760.0
    return None


def _micro_price(chunk: str) -> int:
    price = int(re.sub(r"\D", "", _micro_prop(chunk, "price")) or 0)
    if not price:
        # На живой выдаче цена лежит текстом в блоке priceLabelGrid.
        m = re.search(r"priceLabelGrid[\s\S]{0,900}?([\d][\d\s]{2,12})\s*₽", chunk)
        if m:
            price = int(re.sub(r"\D", "", m.group(1)) or 0)
    if not price:
        m = (re.search(r'itemprop="price"[^>]*content="([\d\s]+)"', chunk, re.I)
             or re.search(r'content="([\d\s]+)"[^>]*itemprop="price"', chunk, re.I))
        if m:
            price = int(re.sub(r"\D", "", m.group(1)) or 0)
    return price


def _micro_photos(chunk: str) -> List[str]:
    photos = re.findall(r'itemProp="image"[^>]*?(?:data-)?src="([^"]+)"', chunk, re.I)
    if not photos:
        for m in re.finditer(r'(?:srcSet|srcset)="([^"]+)"', chunk):
            first = m.group(1).split(",")[0].strip().split(" ")[0]
            if first.startswith("http"):
                photos.append(first)
    if not photos:
        photos = re.findall(r'(?:data-)?src="(https://[\w.-]*img\.avito\.st/[^"]+)"', chunk)
    if not photos:
        photos = re.findall(r"https://[\w.-]*img\.avito\.st/[^\s<>\"']+", chunk)
    uniq = list(dict.fromkeys(p.strip("\"',") for p in photos if p.startswith("http")))
    return [p.split(" ")[0] for p in uniq][:5]


def parse_microdata(page_html: str) -> List[Listing]:
    """Карточки из SSR-разметки: заголовок, цена, ссылка, фото, время."""
    out: List[Listing] = []
    seen = set()
    for chunk in re.split(r'data-marker="item"', page_html or "", flags=re.I)[1:]:
        chunk = chunk[:40000]
        title = ""
        m = re.search(r"item-title[^>]*>(?:\s*<[^>]+>)*\s*([^<]{3,200})", chunk)
        if m:
            title = _html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
        if not title:
            # На текущей вёрстке заголовок лежит в alt карточки.
            m = (re.search(r'<img[^>]*itemProp="image"[^>]*alt="([^"]{3,200})"', chunk, re.I)
                 or re.search(r'<img[^>]*alt="([^"]{3,200})"[^>]*itemProp="image"', chunk, re.I))
            if m:
                title = _html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
        if not title:
            continue
        url = _micro_prop(chunk, "url", "href")
        if not url:
            m = re.search(r'href="(/[^"]+_\d{6,}[^"]*)"', chunk)
            if not m:
                m = re.search(r'href="(/\d{7,})(?:\?|")', chunk)
            url = m.group(1) if m else ""
        if not url:
            continue
        if url.startswith("/"):
            url = "https://www.avito.ru" + url
        m = re.search(r'data-item-id="(\d+)"', chunk)
        if m:
            iid = int(m.group(1))
        else:
            m = re.search(r"_(\d{6,})(?:\?|$)", url)
            if not m:
                continue
            iid = int(m.group(1))
        if iid in seen:
            continue
        seen.add(iid)
        m = re.search(r'data-marker="item-date"[^>]*>([^<]+)<', chunk)
        hours = _hours_ago(m.group(1)) if m else None
        photos = _micro_photos(chunk)
        out.append(Listing(
            id=iid,
            title=title[:200],
            price=_micro_price(chunk),
            url=url.split("?")[0],
            image=photos[0] if photos else None,
            location=(_micro_prop(chunk, "addressLocality")
                      or _micro_prop(chunk, "address", "content")),
            ts=(time.time() - hours * 3600.0) if hours is not None else None,
        ))
    return out


def _main_catalog(o: Any, out: List[dict], depth: int = 0) -> bool:
    """Карточки ТОЛЬКО основной выдачи: список items внутри узла catalog.

    Блоки «Вам может понравиться», «Похожие», объявления из других регионов лежат
    в других ключах — их брать нельзя (старый сборщик присылал из-за них чужие лоты).
    Возвращает True, если узел catalog.items найден.
    """
    if depth > 40:
        return False
    hit = False
    if isinstance(o, dict):
        cat = o.get("catalog")
        if isinstance(cat, dict) and isinstance(cat.get("items"), list):
            _walk(cat["items"], out)
            hit = True
        else:
            for v in o.values():
                hit = _main_catalog(v, out, depth + 1) or hit
    elif isinstance(o, list):
        for v in o:
            hit = _main_catalog(v, out, depth + 1) or hit
    return hit


def _listings_from_nodes(found: List[dict]) -> List[Listing]:
    items: List[Listing] = []
    seen = set()
    for d in found:
        try:
            iid = int(d["id"])
        except (KeyError, TypeError, ValueError):
            continue
        if iid in seen:
            continue
        path = d.get("urlPath") or d.get("url") or ""
        if not isinstance(path, str) or not path:
            continue
        seen.add(iid)
        title0 = str(d.get("title") or "").strip()
        if _is_junk_title(title0):
            continue
        ts = d.get("sortTimeStamp") or d.get("time") or d.get("publishedAt") or d.get("date")
        items.append(Listing(
            id=iid,
            title=str(d.get("title") or "").strip(),
            price=_price(d),
            url=path if path.startswith("http") else "https://www.avito.ru" + path,
            image=_image(d),
            location=_location(d),
            description=str(d.get("description") or d.get("shortDescription") or "").strip(),
            ts=(ts / 1000.0) if isinstance(ts, (int, float)) and ts > 1e11 else None,
        ))
    return items


def parse_page(page_html: str) -> Page:
    """Разбирает выдачу: состояние страницы, __initialData__, JSON API или микроразметку."""
    text = page_html or ""
    # 0. JSON API (spfa/web items): items лежат в items/result.items/catalog.
    if text.lstrip().startswith("{"):
        try:
            data = json.loads(text)
        except (ValueError, TypeError):
            data = None
        if isinstance(data, dict):
            found: List[dict] = []
            if _main_catalog(data, found) and found:
                items = _listings_from_nodes(found)
                if items:
                    return Page(items, True)
            # Никакого _walk: иначе в выдачу попадают «похожие» и мусор.
    # 1. Текущий формат: JSON в data-mfe-state. catalog.items — только
    #    основная выдача, «похожие» в extraBlockItems и сюда не попадают.
    nodes = _mfe_catalog_items(text)
    if nodes is not None:
        return Page(_listings_from_nodes(nodes), True)
    # 2. Прежний формат: window.__initialData__ (если Авито его вернёт).
    m = _INIT_RE.search(text)
    if m:
        try:
            data = json.loads(unquote(m.group(1)))
        except (ValueError, TypeError):
            data = None
        if data is not None:
            found: List[dict] = []
            if _main_catalog(data, found) and found:
                items = _listings_from_nodes(found)
                if items:
                    return Page(items, True)
    # 2b. Новый формат: window.__INITIALDATA__ = {...}.
    data = _initialdata_obj(text)
    if isinstance(data, dict):
        found = []
        hit = _main_catalog(data, found)
        items = _listings_from_nodes(found) if found else []
        if items:
            return Page(items, True)
        if hit:
            return Page([], True)     # catalog.items есть, но пустой
    # 3. Запасной путь: микроразметка, но без блока «похожих».
    items = parse_microdata(_cut_extra(text))
    if items:
        return Page(items, True)
    low = text.lower()
    if "ничего не найдено" in low or "нет объявлений" in low:
        return Page([], True)       # пустая выдача — страница распознана
    return Page([], False)



# --------------------------------------------------------------------------
# Хранилище
# --------------------------------------------------------------------------

@dataclass
class Watch:
    id: int
    user_id: int
    url: str
    title: str
    interval: Optional[int]
    baseline_done: bool
    crit_id: Optional[int] = None   # поиск бота (hunt_criteria.id), если слежение создано синхронизацией


class Store:
    def __init__(self, path: str):
        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)
        self._lock = threading.Lock()
        self._c = sqlite3.connect(path, check_same_thread=False)
        self._c.execute("PRAGMA journal_mode=WAL")
        self._c.executescript("""
            CREATE TABLE IF NOT EXISTS live_watch(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                interval INTEGER,
                active INTEGER NOT NULL DEFAULT 1,
                baseline_done INTEGER NOT NULL DEFAULT 0,
                created REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_live_watch_user ON live_watch(user_id, active);
            CREATE TABLE IF NOT EXISTS live_seen(
                watch_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                ts REAL NOT NULL,
                PRIMARY KEY(watch_id, item_id)
            );
        """)
        try:    # миграция: связь слежения с поиском бота
            self._c.execute("ALTER TABLE live_watch ADD COLUMN crit_id INTEGER")
        except sqlite3.OperationalError:
            pass
        self._c.commit()

    def _q(self, sql: str, args: tuple = ()) -> List[tuple]:
        with self._lock:
            cur = self._c.execute(sql, args)
            rows = cur.fetchall()
            self._c.commit()
            return rows

    @staticmethod
    def _w(r: tuple) -> Watch:
        return Watch(r[0], r[1], r[2], r[3], r[4], bool(r[5]), r[6])

    _COLS = "id,user_id,url,title,interval,baseline_done,crit_id"

    def add_watch(self, user_id: int, url: str, interval: Optional[int] = None) -> int:
        dup = self._q("SELECT id FROM live_watch WHERE user_id=? AND url=? AND active=1",
                      (user_id, url))
        if dup:
            return dup[0][0]
        with self._lock:
            cur = self._c.execute(
                "INSERT INTO live_watch(user_id,url,title,interval,created) VALUES(?,?,?,?,?)",
                (user_id, url, watch_title(url), interval, time.time()))
            self._c.commit()
            return int(cur.lastrowid)

    def remove_watch(self, watch_id: int, user_id: Optional[int] = None,
                     manual_only: bool = False) -> bool:
        sql = "UPDATE live_watch SET active=0 WHERE id=? AND active=1"
        if manual_only:
            sql += " AND crit_id IS NULL"
        args: tuple = (watch_id,)
        if user_id is not None:
            sql += " AND user_id=?"
            args += (user_id,)
        with self._lock:
            n = self._c.execute(sql, args).rowcount
            self._c.commit()
        return n > 0

    def deactivate_user(self, user_id: int) -> None:
        self._q("UPDATE live_watch SET active=0 WHERE user_id=?", (user_id,))

    def user_watches(self, user_id: int, manual_only: bool = False) -> List[Watch]:
        extra = " AND crit_id IS NULL" if manual_only else ""
        return [self._w(r) for r in self._q(
            f"SELECT {self._COLS} FROM live_watch WHERE user_id=? AND active=1{extra} ORDER BY id",
            (user_id,))]

    def sync_criteria(self, desired: Dict[Tuple[int, str], Tuple[int, Optional[int]]]) -> Tuple[int, int]:
        """Приводит слежения, созданные из поисков бота, к списку desired.

        desired: {(user_id, url): (crit_id, interval_sec)}. Недостающие создаёт,
        у существующих обновляет период, лишние (поиск удалён/на паузе) выключает.
        Слежения, созданные командой /watch (crit_id пуст), не трогает.
        Возвращает (добавлено, выключено).
        """
        added = removed = 0
        with self._lock:
            rows = self._c.execute(
                "SELECT id,user_id,url,interval,crit_id FROM live_watch "
                "WHERE active=1 AND crit_id IS NOT NULL").fetchall()
            have: Dict[Tuple[int, str], tuple] = {}
            for wid, uid, url, iv, cid in rows:
                key = (uid, url)
                if key in desired and key not in have:
                    have[key] = (wid, iv, cid)
                else:       # дубль или поиск больше не нужен
                    self._c.execute("UPDATE live_watch SET active=0 WHERE id=?", (wid,))
                    removed += 1
            for key, (cid, iv) in desired.items():
                if key in have:
                    wid, old_iv, old_cid = have[key]
                    if old_iv != iv or old_cid != cid:
                        self._c.execute("UPDATE live_watch SET interval=?, crit_id=? WHERE id=?",
                                        (iv, cid, wid))
                    continue
                uid, url = key
                # Та же ссылка уже есть как ручное слежение (/watch) — привязываем к поиску.
                man = self._c.execute(
                    "SELECT id FROM live_watch WHERE user_id=? AND url=? AND active=1 "
                    "AND crit_id IS NULL", (uid, url)).fetchone()
                if man:
                    self._c.execute("UPDATE live_watch SET crit_id=?, interval=? WHERE id=?",
                                    (cid, iv, man[0]))
                    continue
                self._c.execute(
                    "INSERT INTO live_watch(user_id,url,title,interval,crit_id,created) "
                    "VALUES(?,?,?,?,?,?)", (uid, url, watch_title(url), iv, cid, time.time()))
                added += 1
            self._c.commit()
        return added, removed

    def active_by_url(self) -> Dict[str, List[Watch]]:
        out: Dict[str, List[Watch]] = {}
        for r in self._q(f"SELECT {self._COLS} FROM live_watch WHERE active=1"):
            w = self._w(r)
            out.setdefault(w.url, []).append(w)
        return out

    def seen_ids(self, watch_id: int) -> set:
        return {r[0] for r in self._q("SELECT item_id FROM live_seen WHERE watch_id=?", (watch_id,))}

    def mark_seen(self, watch_id: int, ids: List[int]) -> None:
        now = time.time()
        with self._lock:
            self._c.executemany(
                "INSERT OR IGNORE INTO live_seen(watch_id,item_id,ts) VALUES(?,?,?)",
                [(watch_id, i, now) for i in ids])
            self._c.commit()

    def set_baseline(self, watch_id: int) -> None:
        self._q("UPDATE live_watch SET baseline_done=1 WHERE id=?", (watch_id,))

    def cleanup(self) -> None:
        self._q("DELETE FROM live_seen WHERE ts<?", (time.time() - SEEN_TTL_SEC,))
        self._q("DELETE FROM live_seen WHERE watch_id IN (SELECT id FROM live_watch WHERE active=0)")


# --------------------------------------------------------------------------
# Скачивание страниц
# --------------------------------------------------------------------------

_GET_CACHE: Dict[str, Any] = {}
_GET_INFLIGHT: Dict[str, Any] = {}
_METRICS: Dict[str, int] = {}
_SPFA_CACHE: Dict[str, Any] = {}
_SPFA_CACHE_TS: float = 0.0
# Кэш cookies общий для всех процессов/инстансов: Amvera может держать
# несколько реплик, и у каждой был свой кэш в памяти — из-за этого cookies
# выписывались каждые пару минут и жгли по 3 ₽.
_SPFA_CACHE_FILE = os.environ.get("SPFA_CACHE_FILE", "/data/spfa_cache.json")
# Жёсткий минимум между выписками, что бы ни просил код выше.
_SPFA_HARD_MIN = float(os.environ.get("SPFA_HARD_MIN_SEC", "3600"))


def _load_spfa_cache_file() -> None:
    global _SPFA_CACHE, _SPFA_CACHE_TS
    if _SPFA_CACHE:
        return
    try:
        with open(_SPFA_CACHE_FILE, "r", encoding="utf-8") as fh:
            obj = json.load(fh) or {}
        data = obj.get("data") or {}
        ts = float(obj.get("ts") or 0)
        if data.get("cookies") and ts and (time.time() - ts) < _SPFA_TTL:
            _SPFA_CACHE, _SPFA_CACHE_TS = data, ts
    except Exception:
        pass


def _save_spfa_cache_file(data: Dict[str, Any], ts: float) -> None:
    try:
        tmp = _SPFA_CACHE_FILE + ".tmp"
        os.makedirs(os.path.dirname(_SPFA_CACHE_FILE), exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump({"ts": ts, "data": data}, fh)
        os.replace(tmp, _SPFA_CACHE_FILE)
    except Exception as e:
        log.warning("avito_live: не сохранил кэш spfa: %s", e)
_SPFA_TTL = 11 * 3600


class SpfaUnavailable(FetchError):
    """spfa не выписал cookies: сам сервис лежит или не достаёт до нашего HTTP-прокси."""


def to_fetch_proxy(p: str) -> str:
    """Приводит адрес прокси к виду для curl_cffi.

    host:port -> http://host:port; socks5:// -> socks5h:// (имя avito.ru
    резолвит сам прокси: с нашей стороны DNS-запросы режутся/светятся).
    """
    p = (p or "").strip()
    if not p:
        return ""
    if "://" not in p:
        return "http://" + p
    if p.lower().startswith("socks5://"):
        return "socks5h://" + p[len("socks5://"):]
    return p


def _retry_after(r: Any) -> Optional[float]:
    """Retry-After в секундах (если это число), не больше 2 минут."""
    try:
        v = r.headers.get("Retry-After")
        return min(max(float(v), 0.0), 120.0) if v is not None else None
    except Exception:
        return None


class Fetcher:
    """Качает выдачу через curl_cffi с отпечатком браузера; ротация прокси и повторы.

    Два пути:
      * spfa (SPFA_API_KEY + SPFA_PROXY): cookies выписывает spfa.pro, страницу берём сами.
        ВАЖНО: адрес из SPFA_PROXY (HTTP) видит только сервер spfa — он нужен, чтобы
        cookies легли под IP прокси. Сами мы на Авито ходим через SPFA_FETCH_PROXY
        (socks5h://…) — это тот же выходной IP, но порт, который доступен с нашей сети.
      * прямой (AVITO_PROXIES): edge101 + смена IP; он же — запасной, если spfa недоступен.
    """

    def __init__(self, proxies: Optional[List[str]] = None, timeout: float = 30.0,
                 impersonate: Optional[str] = None):
        plist = [p.strip() for p in (proxies or []) if p and p.strip()]
        self.proxies: List[Optional[str]] = plist or [None]
        self.timeout = float(os.environ.get("AVITO_TIMEOUT", timeout))   # мобильный прокси медленный
        self.impersonate = impersonate or os.environ.get("AVITO_IMPERSONATE", "edge101")
        # Новая сессия на каждый запрос: у мобильного прокси IP меняется, а куки прошлого
        # IP (и куки, выданные вместе с 429) только палят нас. 0 — вернуть общую сессию.
        self.fresh = os.environ.get("AVITO_FRESH_SESSION", "1") != "0"
        # Ссылка смены IP из личного кабинета прокси-провайдера (необязательно).
        self.rotate_url = os.environ.get("AVITO_PROXY_ROTATE_URL", "").strip()
        # Авито пускает вероятностно: один и тот же IP то отдаёт выдачу, то 403/429/439.
        # Поэтому несколько попыток со сменой IP, а не одна.
        self.tries = max(1, int(os.environ.get("AVITO_TRIES", "3")))
        # Минимальная пауза между запросами через один прокси: 429 — это в первую очередь
        # частота, а не «плохой» клиент.
        self.min_gap = float(os.environ.get("AVITO_MIN_GAP_SEC", "4"))
        self._sessions: Dict[Optional[str], Any] = {}
        self._cool: Dict[Optional[str], float] = {}
        self._fails: Dict[Optional[str], int] = {}
        self._rr = 0
        self._rot_lock = asyncio.Lock()
        self._last_rot = 0.0
        self._pace_locks: Dict[str, asyncio.Lock] = {}
        self._last_req: Dict[str, float] = {}
        # spfa.pro: cookies под IP прокси.
        self.spfa_key = os.environ.get("SPFA_API_KEY", "").strip()
        self.spfa_proxy = os.environ.get("SPFA_PROXY", "").strip()        # HTTP: его видит spfa
        self.spfa_base = os.environ.get("SPFA_URL", "https://spfa.pro").rstrip("/")
        # Наш путь до Авито в spfa-режиме: явный SPFA_FETCH_PROXY, иначе первый из
        # AVITO_PROXIES (там SOCKS5), иначе (как раньше) тот же SPFA_PROXY.
        fp = os.environ.get("SPFA_FETCH_PROXY", "").strip() or next((p for p in self.proxies if p), "") or ""
        self.spfa_fetch_proxy = to_fetch_proxy(fp or self.spfa_proxy)
        self.spfa_refresh_min = float(os.environ.get("SPFA_REFRESH_MIN_SEC", "3600"))
        self._spfa_off_until = 0.0

    def _kw(self, proxy: Optional[str]) -> Dict[str, Any]:
        kw: Dict[str, Any] = {"impersonate": self.impersonate}
        if proxy:
            px = to_fetch_proxy(proxy)
            kw["proxies"] = {"http": px, "https": px}
        return kw

    def _session(self, proxy: Optional[str]):
        s = self._sessions.get(proxy)
        if s is None:
            from curl_cffi.requests import AsyncSession  # ленивый импорт: нужен только в бою
            s = AsyncSession(**self._kw(proxy))
            self._sessions[proxy] = s
        return s

    def _pick(self) -> Optional[str]:
        now = time.monotonic()
        live = [p for p in self.proxies if self._cool.get(p, 0) <= now]
        if not live:
            raise NoProxy("все прокси на паузе")
        self._rr += 1
        return live[self._rr % len(live)]

    def _penalize(self, proxy: Optional[str], base: float) -> None:
        n = self._fails.get(proxy, 0) + 1
        self._fails[proxy] = n
        self._cool[proxy] = time.monotonic() + min(900.0, base * (2 ** (n - 1)))

    def _has_real_proxy(self) -> bool:
        return any(self.proxies)

    async def _pace(self, key: Optional[str]) -> None:
        """Не чаще одного запроса в min_gap секунд (с разбросом) через один прокси."""
        if self.min_gap <= 0:
            return
        k = key or "-"
        lock = self._pace_locks.setdefault(k, asyncio.Lock())
        async with lock:
            wait = self._last_req.get(k, 0.0) + self.min_gap * random.uniform(1.0, 1.5) - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_req[k] = time.monotonic()

    async def _rotate_ip(self) -> bool:
        """Просит провайдера сменить IP мобильного прокси (не чаще раза в 8 с)."""
        if not self.rotate_url:
            return False
        async with self._rot_lock:
            if time.monotonic() - self._last_rot < 8:
                return True          # только что меняли — просто используем новый IP
            self._last_rot = time.monotonic()
            try:
                from curl_cffi.requests import AsyncSession
                wait = 15.0
                async with AsyncSession() as s:
                    r = await s.get(self.rotate_url, timeout=30)
                # Провайдер отвечает {"status":"OK","rt":13.3,"new_ip":...} —
                # ждём столько, сколько он просит, иначе запрос уйдёт на старый IP.
                try:
                    wait = float(r.json().get("rt") or 0) + 4
                except (ValueError, TypeError, AttributeError):
                    pass
                wait = min(max(wait, 10.0), 30.0)
                log.warning("avito_live: запросил смену IP прокси, жду %.0fс", wait)
                await asyncio.sleep(wait)
                return True
            except Exception as e:
                log.warning("avito_live: смена IP не удалась: %s", e)
                return False

    async def _request(self, proxy: Optional[str], url: str):
        hdr = {"Accept-Language": "ru-RU,ru;q=0.9"}
        await self._pace(proxy)
        if self.fresh:
            from curl_cffi.requests import AsyncSession
            async with AsyncSession(**self._kw(proxy)) as s:
                return await s.get(url, timeout=self.timeout, allow_redirects=True, headers=hdr)
        return await self._session(proxy).get(url, timeout=self.timeout, allow_redirects=True, headers=hdr)

    async def _spfa_api_url(self, url: str) -> str:
        from curl_cffi.requests import AsyncSession
        async with AsyncSession() as s:
            r = await s.post(self.spfa_base + "/api/avito-url/", json={"url": url}, timeout=40)
        data = r.json() if r is not None else {}
        return (data or {}).get("api_url") or url

    async def _spfa_cookies(self, force_after: Optional[float] = None) -> dict:
        """Cookies от spfa (кэш 11 ч).

        force_after — перевыписать, если кэшу не меньше стольких секунд
        (0 — немедленно, например после смены IP; None — не перевыписывать).
        Если перевыписать не вышло, а старые cookies ещё живы — отдаём старые.
        """
        global _SPFA_CACHE, _SPFA_CACHE_TS
        if not _SPFA_CACHE:
            _load_spfa_cache_file()
        age = time.time() - _SPFA_CACHE_TS
        # Жёсткий минимум: даже если вызывающий просит refresh=0, чаще
        # чем раз в 30 минут cookies не выписываем — это деньги.
        if _SPFA_CACHE and age < _SPFA_HARD_MIN:
            return _SPFA_CACHE
        if _SPFA_CACHE and age < _SPFA_TTL and not (force_after is not None and age >= force_after):
            return _SPFA_CACHE
        from curl_cffi.requests import AsyncSession
        try:
            async with AsyncSession() as s:
                r = await s.post(self.spfa_base + "/api/cookies/mobile/",
                                 json={"api_key": self.spfa_key, "proxy": self.spfa_proxy},
                                 timeout=90)
            body = r.json()
            body = body if isinstance(body, dict) else {}
            data = body.get("results") or {}
            if not data.get("cookies"):
                why = str(body.get("error") or body.get("detail") or f"HTTP {r.status_code}")[:120]
                raise SpfaUnavailable(f"spfa: нет cookies ({why})")
        except SpfaUnavailable as e:
            if _SPFA_CACHE and age < _SPFA_TTL:
                log.warning("avito_live: %s — оставляю прежние cookies", e)
                return _SPFA_CACHE
            raise
        except Exception as e:
            if _SPFA_CACHE and age < _SPFA_TTL:
                log.warning("avito_live: spfa не ответил (%s) — оставляю прежние cookies", e)
                return _SPFA_CACHE
            raise SpfaUnavailable(f"spfa: {type(e).__name__}: {e}") from e
        _SPFA_CACHE, _SPFA_CACHE_TS = data, time.time()
        return data

    async def _spfa_get(self, url: str) -> str:
        from curl_cffi.requests import AsyncSession
        # Страница берётся по исходной ссылке, а не JSON API: выдача ровно как на Авито,
        # без «похожих» и запчастей. Идём через spfa_fetch_proxy (SOCKS5), а не через
        # HTTP-порт из SPFA_PROXY — он с нашей сети недоступен.
        refresh: Optional[float] = None
        for attempt in range(1, self.tries + 1):
            data = await self._spfa_cookies(refresh)
            cookies = data.get("cookies") or {}
            fp = data.get("fingerprint") or {}
            headers = dict(fp.get("headers") or {})
            if data.get("user_agent"):
                headers.setdefault("user-agent", data["user_agent"])
            kw: Dict[str, Any] = {
                "impersonate": fp.get("impersonate") or "chrome131_android",
                "headers": headers, "cookies": cookies,
                "timeout": max(self.timeout, 45)}
            if self.spfa_fetch_proxy:
                kw["proxies"] = {"http": self.spfa_fetch_proxy, "https": self.spfa_fetch_proxy}
            await self._pace(self.spfa_fetch_proxy)
            try:
                async with AsyncSession(**kw) as s:
                    r = await s.get(url, allow_redirects=True)
            except Exception as e:
                hint = ""
                if self.spfa_fetch_proxy.startswith("http://"):
                    hint = " (HTTP-порт прокси может быть закрыт: задайте SPFA_FETCH_PROXY=socks5h://…)"
                raise FetchError(f"{type(e).__name__}: {e}{hint}") from e
            code = r.status_code
            if code in BLOCK_CODES:
                if attempt >= self.tries:
                    raise Blocked(f"HTTP {code}")
                rotated = await self._rotate_ip()
                # cookies привязаны к IP: после смены IP — выписать заново сразу;
                # 403/439 — отпечаток/cookies забракованы; 429 — частота, тут сначала пауза.
                # Любой блок (403/439/429) — это IP или частота, а НЕ
                # протухшие cookies. Новые cookies за 3 ₽ не выписываем:
                # они обновятся сами по 11-часовому TTL. Иначе при 50
                # ссылках и постоянных 429 баланс сгорал бы за день.
                refresh = None
                if not rotated:
                    pause = _retry_after(r)
                    if pause is None:
                        pause = min(60.0, 6.0 * 2 ** (attempt - 1))
                    pause *= random.uniform(1.0, 1.4)
                    log.info("avito_live: HTTP %s (spfa-путь), пауза %.0fс, попытка %s из %s",
                             code, pause, attempt + 1, self.tries)
                    await asyncio.sleep(pause)
                continue
            if code >= 400:
                raise FetchError(f"HTTP {code}")
            return r.text
        raise Blocked("попытки закончились")

    async def _plain_get(self, url: str) -> str:
        proxy = self._pick()
        for attempt in range(1, self.tries + 1):
            try:
                r = await self._request(proxy, url)
            except Exception as e:  # сеть, таймаут, прокси
                self._penalize(proxy, 10)
                raise FetchError(f"{type(e).__name__}: {e}") from e
            if r.status_code in BLOCK_CODES:
                # Авито пускает не каждый запрос: меняем IP и пробуем ещё раз.
                if attempt < self.tries:
                    if await self._rotate_ip():
                        log.info("avito_live: HTTP %s — сменил IP, попытка %s из %s",
                                 r.status_code, attempt + 1, self.tries)
                        continue
                    ra = _retry_after(r)
                    if ra is not None and r.status_code == 429:
                        await asyncio.sleep(ra * random.uniform(1.0, 1.4))
                        continue
                self._penalize(proxy, 45)
                raise Blocked(f"HTTP {r.status_code}")
            if r.status_code >= 400:
                self._penalize(proxy, 10)
                raise FetchError(f"HTTP {r.status_code}")
            self._fails[proxy] = 0
            return r.text
        raise Blocked("попытки закончились")

    async def get(self, url: str) -> str:
        # Кэш выдачи: 20 человек с одинаковым поиском не должны 20 раз
        # выписывать cookies у spfa. TTL короткий, чтобы находки не старели.
        _ttl = float(os.environ.get("AVITO_GET_CACHE_SEC", "120"))
        _hit = _GET_CACHE.get(url)
        if _hit and (time.monotonic() - _hit[0]) < _ttl:
            _METRICS["hits"] = _METRICS.get("hits", 0) + 1
            return _hit[1]
        _fut = _GET_INFLIGHT.get(url)
        if _fut is not None:
            _METRICS["dedup"] = _METRICS.get("dedup", 0) + 1
            return await _fut
        _loop = asyncio.get_running_loop()
        _fut = _loop.create_future()
        _GET_INFLIGHT[url] = _fut
        _METRICS["calls"] = _METRICS.get("calls", 0) + 1
        try:
            _text = await self._get_uncached(url)
            _GET_CACHE[url] = (time.monotonic(), _text)
            if not _fut.done():
                _fut.set_result(_text)
            return _text
        except Exception as _e:
            if not _fut.done():
                _fut.set_exception(_e)
            raise
        finally:
            _GET_INFLIGHT.pop(url, None)

    async def _get_uncached(self, url: str) -> str:
        if self.spfa_key and self.spfa_proxy:
            if time.monotonic() >= self._spfa_off_until:
                try:
                    return await self._spfa_get(url)
                except SpfaUnavailable as e:
                    # spfa не выписал cookies — это не блокировка Авито. Если есть свой
                    # прокси, не стоим: 5 минут берём выдачу напрямую (edge101 + смена IP).
                    if not self._has_real_proxy():
                        raise
                    self._spfa_off_until = time.monotonic() + 300
                    log.warning("avito_live: %s — 5 минут беру выдачу напрямую через прокси", e)
            elif not self._has_real_proxy():
                raise SpfaUnavailable("spfa на паузе, прямого прокси нет")
        return await self._plain_get(url)


# --------------------------------------------------------------------------
# Основной цикл
# --------------------------------------------------------------------------

Sink = Callable[[Watch, Listing], Awaitable[None]]


class LiveWatcher:
    def __init__(self, store: Store, fetcher: Any, sink: Sink, *, interval: float = 120.0,
                 concurrency: int = 1,
                 on_health: Optional[Callable[[str], Awaitable[None]]] = None,
                 item_filter: Optional[Callable[[Watch, Listing], bool]] = None):
        self.store, self.fetcher, self.sink = store, fetcher, sink
        self.item_filter = item_filter
        self.interval = interval
        self.sem = asyncio.Semaphore(concurrency)
        self.on_health = on_health
        self._next: Dict[str, float] = {}
        self._blocks: Dict[str, int] = {}
        self._last_health = 0.0
        self._last_ok = 0.0
        self._last_cleanup = 0.0
        self._stop = False

    def stop(self) -> None:
        self._stop = True

    def last_ok_ts(self) -> float:
        """Когда последний раз успешно прочитали выдачу (unix-время). 0 — ещё нет."""
        return self._last_ok

    def _url_interval(self, watches: List[Watch]) -> float:
        own = [w.interval for w in watches if w.interval]
        return float(min(own)) if own else self.interval

    async def poll_url(self, url: str, watches: List[Watch]) -> int:
        """Один опрос ссылки. Возвращает число отправленных объявлений."""
        page_html = await self.fetcher.get(url)
        page = parse_page(page_html)
        if not page.recognized:
            low = page_html.lower()
            if any(m in low for m in BLOCK_MARKERS):
                raise Blocked("страница блокировки")
            raise FetchError("страница не распознана (изменилась вёрстка?)")
        sent = 0
        for w in watches:
            seen = self.store.seen_ids(w.id)
            fresh = [it for it in page.items if it.id not in seen]
            if not w.baseline_done:
                self.store.mark_seen(w.id, [it.id for it in page.items])
                self.store.set_baseline(w.id)
                continue
            if not fresh:
                continue
            self.store.mark_seen(w.id, [it.id for it in fresh])
            fresh = [it for it in fresh if it.age() is None or it.age() <= MAX_AGE_SEC]
            if self.item_filter:
                fresh = [it for it in fresh if self._pass(w, it)]
            # Сначала самые новые: по времени публикации; без времени — по id.
            fresh.sort(key=lambda it: (it.ts or 0, it.id))
            if len(fresh) > MAX_BURST:
                fresh = fresh[-MAX_BURST:]
            for it in fresh:
                try:
                    await self.sink(w, it)
                    sent += 1
                except Exception:
                    log.exception("sink failed for watch %s item %s", w.id, it.id)
        return sent

    def _pass(self, w: Watch, it: Listing) -> bool:
        try:
            return bool(self.item_filter(w, it))
        except Exception:
            log.exception("item_filter failed")
            return True

    async def _poll_guarded(self, url: str, watches: List[Watch]) -> None:
        async with self.sem:
            now = time.monotonic()
            try:
                await self.poll_url(url, watches)
                self._last_ok = time.time()
                self._blocks.pop(url, None)
                step = self._url_interval(watches)
                self._next[url] = now + step * random.uniform(0.8, 1.2)
            except NoProxy as e:
                # Прокси остывает после блокировки. Это не блокировка этой
                # ссылки: не копим счётчик и не шлём админу алерты.
                self._next[url] = now + 15
                log.info("avito_live: %s", e)
            except Blocked as e:
                n = self._blocks.get(url, 0) + 1
                self._blocks[url] = n
                delay = min(900.0, 30.0 * 2 ** (n - 1))
                self._next[url] = now + delay
                log.warning("blocked %s (%s), пауза %.0fс", url[:80], e, delay)
                await self._health(f"Авито блокирует запросы ({e}); подряд: {n}", n)
            except FetchError as e:
                self._next[url] = now + 15
                log.warning("fetch error %s: %s", url[:80], e)
            except Exception:
                self._next[url] = now + 30
                log.exception("poll failed %s", url[:80])

    async def _health(self, msg: str, n: int) -> None:
        # 429 — это rate limit, а не бан; не спамим админа этим алертом.
        if "429" in str(msg):
            return
        if not self.on_health or n < 3 or time.time() - self._last_health < 3600:
            return
        self._last_health = time.time()
        try:
            await self.on_health(msg)
        except Exception:
            log.exception("on_health failed")

    async def run(self) -> None:
        log.info("avito_live: цикл запущен")
        while not self._stop:
            try:
                groups = self.store.active_by_url()
                now = time.monotonic()
                for gone in set(self._next) - set(groups):
                    self._next.pop(gone, None)
                    self._blocks.pop(gone, None)
                tasks = []
                for url, watches in groups.items():
                    if url not in self._next:   # новая ссылка: сразу, не ждём период
                        self._next[url] = now
                    if self._next[url] <= now:
                        self._next[url] = now + 3600   # защита от двойного запуска, перезапишется после опроса
                        tasks.append(asyncio.create_task(self._poll_guarded(url, watches)))
                if time.time() - self._last_cleanup > 6 * 3600:
                    self._last_cleanup = time.time()
                    self.store.cleanup()
                if tasks:
                    await asyncio.gather(*tasks)
            except Exception:
                log.exception("avito_live: ошибка в цикле")
            await asyncio.sleep(1.0)


# --------------------------------------------------------------------------
# Отправка в Telegram и подключение к боту
# --------------------------------------------------------------------------

def format_message(it: Listing) -> str:
    price = f"{it.price:,}".replace(",", " ") + " ₽" if it.price else "цена не указана"
    lines = [f"🆕 <b>{_html.escape(it.title)}</b>", f"💰 {price}"]
    if it.location:
        lines.append(f"📍 {_html.escape(it.location)}")
    if it.description:
        d = it.description.replace("\n", " ")
        lines.append(_html.escape(d[:300] + ("…" if len(d) > 300 else "")))
    return "\n".join(lines)


class TelegramSink:
    """Очередь отправки: ~20 сообщений/с в сумме и не чаще 1/с в один чат."""

    def __init__(self, bot: Any, store: Store, rate: float = 20.0):
        self.bot, self.store = bot, store
        self.q: "asyncio.Queue[Tuple[Watch, Listing]]" = asyncio.Queue(maxsize=5000)
        self._gap = 1.0 / rate
        self._chat_last: Dict[int, float] = {}

    async def __call__(self, watch: Watch, item: Listing) -> None:
        self.q.put_nowait((watch, item))

    async def _send(self, watch: Watch, it: Listing) -> None:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
        from telegram.error import BadRequest, Forbidden, RetryAfter
        rows = [[InlineKeyboardButton("Открыть на Авито", url=it.url)]]
        if watch.crit_id is None:   # поиск бота останавливается в самом боте, иначе синхронизация вернёт его
            rows.append([InlineKeyboardButton("Остановить слежение", callback_data=f"live_stop:{watch.id}")])
        kb = InlineKeyboardMarkup(rows)
        text = format_message(it)
        for attempt in range(2):
            try:
                if it.image:
                    try:
                        await self.bot.send_photo(watch.user_id, it.image, caption=text[:1024],
                                                  parse_mode="HTML", reply_markup=kb)
                        return
                    except BadRequest:
                        pass    # битая картинка -> текстом
                await self.bot.send_message(watch.user_id, text, parse_mode="HTML",
                                            reply_markup=kb, disable_web_page_preview=True)
                return
            except RetryAfter as e:
                await asyncio.sleep(float(e.retry_after) + 1)
            except Forbidden:
                log.info("user %s заблокировал бота, подписки отключены", watch.user_id)
                self.store.deactivate_user(watch.user_id)
                return

    async def run(self) -> None:
        while True:
            watch, it = await self.q.get()
            try:
                wait = 1.0 - (time.monotonic() - self._chat_last.get(watch.user_id, 0))
                if wait > 0:
                    await asyncio.sleep(wait)
                await self._send(watch, it)
                self._chat_last[watch.user_id] = time.monotonic()
            except Exception:
                log.exception("telegram send failed (user %s)", watch.user_id)
            await asyncio.sleep(self._gap)


class LiveRunner:
    """Собранный модуль: запускать через `asyncio.ensure_future(runner.start())`."""

    def __init__(self, store: Store, watcher: LiveWatcher, sink: TelegramSink, max_watches: Callable[[int], int]):
        self.store, self.watcher, self.sink, self.max_watches = store, watcher, sink, max_watches

    def add_watch(self, user_id: int, raw_url: str, interval: Optional[int] = None) -> Tuple[Optional[int], str]:
        """Для команд и Mini App. Возвращает (watch_id, сообщение об ошибке или '')."""
        url = normalize_url(raw_url)
        if not url:
            return None, "Нужна ссылка на выдачу Авито (avito.ru/...) с настроенными фильтрами."
        if len(self.store.user_watches(user_id, manual_only=True)) >= self.max_watches(user_id):
            return None, "Лимит слежений исчерпан. Остановите одно из текущих: /watches"
        return self.store.add_watch(user_id, url, interval), ""

    async def start(self) -> None:
        await asyncio.gather(self.watcher.run(), self.sink.run())


def install(application: Any, *, db_path: Optional[str] = None, proxies: Optional[List[str]] = None,
            max_watches: Optional[Callable[[int], int]] = None,
            admin_ids: Optional[List[int]] = None, fetcher: Any = None,
            item_filter: Optional[Callable[[Watch, Listing], bool]] = None,
            item_sink: Optional[Sink] = None) -> LiveRunner:
    """Регистрирует команды /watch /watches /unwatch и возвращает runner."""
    from telegram import Update
    from telegram.ext import CallbackQueryHandler, CommandHandler, ContextTypes

    if db_path is None:
        base = os.path.dirname(os.environ.get("DB_PATH", "/data/polka.db")) or "."
        db_path = os.environ.get("AVITO_LIVE_DB", os.path.join(base, "avito_live.db"))
    if proxies is None:
        proxies = [p for p in os.environ.get("AVITO_PROXIES", "").split(",") if p.strip()]
    default_max = int(os.environ.get("AVITO_LIVE_MAX", "3"))
    limit = max_watches or (lambda uid: default_max)

    store = Store(db_path)
    tg_sink = TelegramSink(application.bot, store)

    async def route_sink(watch: Watch, item: Listing) -> None:
        # Поиск бота идёт в общий конвейер находок (лента + сообщения),
        # ручное /watch — прямо в Telegram: его в базе бота нет.
        if item_sink is not None and watch.crit_id is not None:
            await item_sink(watch, item)
        else:
            await tg_sink(watch, item)

    async def health(msg: str) -> None:
        for aid in admin_ids or []:
            try:
                await application.bot.send_message(aid, f"⚠️ avito_live: {msg}")
            except Exception:
                pass

    watcher = LiveWatcher(
        store, fetcher or Fetcher(proxies), route_sink,
        interval=float(os.environ.get("AVITO_POLL_SEC", "90")),
        concurrency=int(os.environ.get("AVITO_CONCURRENCY", "1")),
        on_health=health, item_filter=item_filter)
    runner = LiveRunner(store, watcher, tg_sink, limit)

    async def cmd_watch(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        text = " ".join(ctx.args or []) or (update.message.reply_to_message.text if update.message.reply_to_message else "")
        wid, err = runner.add_watch(update.effective_user.id, text)
        if err:
            await update.message.reply_text(err if text else "Пришлите так: /watch <ссылка на выдачу Авито>")
            return
        await update.message.reply_text(
            f"Слежу (№{wid}). Всё, что уже есть в выдаче, пропускаю; "
            "о новых объявлениях напишу сразу, как только они появятся.")

    async def cmd_watches(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        ws = store.user_watches(update.effective_user.id, manual_only=True)
        if not ws:
            await update.message.reply_text("Слежений нет. Добавить: /watch <ссылка>")
            return
        await update.message.reply_text(
            "Ваши слежения:\n" + "\n".join(f"№{w.id}: {w.title}" for w in ws) +
            "\n\nОстановить: /unwatch <номер>")

    async def cmd_unwatch(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        arg = (ctx.args or [""])[0].lstrip("№#")
        if not arg.isdigit():
            await update.message.reply_text("Укажите номер: /unwatch 12 (список: /watches)")
            return
        ok = store.remove_watch(int(arg), update.effective_user.id, manual_only=True)
        await update.message.reply_text("Остановил." if ok else "Такого слежения у вас нет.")

    async def cb_stop(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
        q = update.callback_query
        ok = store.remove_watch(int(q.data.split(":", 1)[1]), q.from_user.id, manual_only=True)
        await q.answer("Слежение остановлено" if ok else "Уже остановлено")

    application.add_handler(CommandHandler("watch", cmd_watch))
    application.add_handler(CommandHandler("watches", cmd_watches))
    application.add_handler(CommandHandler("unwatch", cmd_unwatch))
    application.add_handler(CallbackQueryHandler(cb_stop, pattern=r"^live_stop:\d+$"))
    return runner
