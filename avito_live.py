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

_SPFA_CACHE: Dict[str, Any] = {}
_SPFA_CACHE_TS: float = 0.0


class Fetcher:
    """Качает выдачу через curl_cffi с отпечатком браузера; ротация прокси и повторы."""

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
        self._sessions: Dict[Optional[str], Any] = {}
        self._cool: Dict[Optional[str], float] = {}
        self._fails: Dict[Optional[str], int] = {}
        self._rr = 0
        self._rot_lock = asyncio.Lock()
        self._last_rot = 0.0
        # spfa.pro: cookies под наш HTTP-прокси + JSON API выдачи.
        self.spfa_key = os.environ.get("SPFA_API_KEY", "").strip()
        self.spfa_proxy = os.environ.get("SPFA_PROXY", "").strip()
        self.spfa_base = os.environ.get("SPFA_URL", "https://spfa.pro").rstrip("/")
        self._spfa = None
        self._spfa_ts = 0.0

    def _kw(self, proxy: Optional[str]) -> Dict[str, Any]:
        kw: Dict[str, Any] = {"impersonate": self.impersonate}
        if proxy:
            kw["proxies"] = {"http": proxy, "https": proxy}
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

    async def _spfa_cookies(self) -> dict:
        global _SPFA_CACHE, _SPFA_CACHE_TS
        if _SPFA_CACHE and time.time() - _SPFA_CACHE_TS < 11 * 3600:
            return _SPFA_CACHE
        from curl_cffi.requests import AsyncSession
        async with AsyncSession() as s:
            r = await s.post(self.spfa_base + "/api/cookies/mobile/",
                             json={"api_key": self.spfa_key, "proxy": self.spfa_proxy},
                             timeout=90)
        data = (r.json() or {}).get("results") or {}
        if not data.get("cookies"):
            raise FetchError("spfa: нет cookies")
        _SPFA_CACHE, _SPFA_CACHE_TS = data, time.time()
        return data

    async def _spfa_get(self, url: str) -> str:
        from curl_cffi.requests import AsyncSession
        # Берём саму страницу по исходной ссылке, а не JSON API: так выдача
        # ровно та, что на Авито, без «похожих» и запчастей.
        api_url = url
        data = await self._spfa_cookies()
        cookies = data.get("cookies") or {}
        fp = data.get("fingerprint") or {}
        headers = dict(fp.get("headers") or {})
        if data.get("user_agent"):
            headers.setdefault("user-agent", data["user_agent"])
        imp = fp.get("impersonate") or "chrome131_android"
        proxy = self.spfa_proxy if "://" in self.spfa_proxy else "http://" + self.spfa_proxy
        kw = {"impersonate": imp, "headers": headers, "cookies": cookies,
              "proxies": {"http": proxy, "https": proxy},
              "timeout": max(self.timeout, 45)}
        async with AsyncSession(**kw) as s:
            r = await s.get(api_url, allow_redirects=True)
        if r.status_code in BLOCK_CODES:
            raise Blocked(f"HTTP {r.status_code}")
        if r.status_code >= 400:
            raise FetchError(f"HTTP {r.status_code}")
        return r.text

    async def get(self, url: str) -> str:
        if self.spfa_key and self.spfa_proxy:
            return await self._spfa_get(url)
        proxy = self._pick()
        for attempt in range(1, self.tries + 1):
            try:
                r = await self._request(proxy, url)
            except Exception as e:  # сеть, таймаут, прокси
                self._penalize(proxy, 10)
                raise FetchError(f"{type(e).__name__}: {e}") from e
            if r.status_code in BLOCK_CODES:
                # Авито пускает не каждый запрос: меняем IP и пробуем ещё раз.
                if attempt < self.tries and await self._rotate_ip():
                    log.info("avito_live: HTTP %s — сменил IP, попытка %s из %s",
                             r.status_code, attempt + 1, self.tries)
                    continue
                self._penalize(proxy, 45)
                raise Blocked(f"HTTP {r.status_code}")
            if r.status_code >= 400:
                self._penalize(proxy, 10)
                raise FetchError(f"HTTP {r.status_code}")
            self._fails[proxy] = 0
            return r.text
        raise Blocked("попытки закончились")


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
