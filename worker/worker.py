"""Воркер быстрого мониторинга Авито.

Запускается на компьютере с видимым Chromium и постоянным профилем: Авито
пускает такой браузер, а прямые HTTP-запросы режет. Воркер получает ссылки
с сервера Полки, раз в N секунд читает выдачу из контекста браузера и шлёт
новые объявления на сервер. Дальше сервер сам кладёт их в чат и ленту.

Настройки — переменными окружения (см. start-worker.bat):
  POLKA_SERVER        https://...            адрес сервера Полки
  LIVE_WORKER_TOKEN   ...                    токен воркера (задаётся в Amvera)
  AVITO_PROFILE       C:\\Polka\\profile      папка профиля Chromium
  WORKER_HEADLESS     0                      1 — без окна (Авито часто режет)
  WORKER_POLL_MIN     2                      минимальный интервал, секунды
  WORKER_STATE        worker_state.json      файл «уже видели»

Запуск:  python worker.py            (цикл)
         python worker.py --once     (одна проверка, для теста)
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = (os.environ.get("POLKA_SERVER") or "").rstrip("/")
TOKEN = os.environ.get("LIVE_WORKER_TOKEN") or ""
PROFILE = os.environ.get("AVITO_PROFILE") or os.path.join(HERE, "profile")
HEADLESS = str(os.environ.get("WORKER_HEADLESS", "0")) == "1"
POLL_MIN = max(1, int(os.environ.get("WORKER_POLL_MIN", "2")))
STATE_FILE = os.environ.get("WORKER_STATE") or os.path.join(HERE, "worker_state.json")
LOG_FILE = os.path.join(HERE, "worker.log")
HEARTBEAT_EVERY = 30
GROUPS_EVERY = 60
MAX_SEEN = 3000


def log(msg: str) -> None:
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


# ── HTTP к серверу Полки ────────────────────────────────────────────────────

def server_call(path: str, payload=None, method: str = "GET"):
    if not SERVER:
        raise RuntimeError("POLKA_SERVER не задан")
    data = None
    headers = {"X-Live-Token": TOKEN}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(SERVER + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8", "ignore"))


def fetch_groups():
    data = server_call("/api/live/watches")
    return data.get("groups") or []


def send_findings(items, crit_ids):
    return server_call("/api/live/findings",
                       {"items": items, "crit_ids": crit_ids}, "POST")


def heartbeat():
    return server_call("/api/live/heartbeat", {}, "POST")


# ── Разбор выдачи ───────────────────────────────────────────────────────────

def _image(images) -> Optional[str]:
    if not isinstance(images, list) or not images:
        return None
    first = images[0]
    if isinstance(first, str) and first.startswith("http"):
        return first
    if isinstance(first, dict):
        best, best_area = None, -1
        for key, val in first.items():
            if not (isinstance(val, str) and val.startswith("http")):
                continue
            m = re.match(r"(\d+)x(\d+)", str(key))
            area = int(m.group(1)) * int(m.group(2)) if m else 0
            if area > best_area:
                best, best_area = val, area
        return best
    return None


def _city(item: dict) -> str:
    loc = item.get("location")
    if isinstance(loc, dict) and loc.get("name"):
        return str(loc["name"])
    addr = item.get("addressDetailed")
    if isinstance(addr, dict) and addr.get("locationName"):
        return str(addr["locationName"])
    geo = item.get("geo")
    if isinstance(geo, dict) and geo.get("formattedAddress"):
        return str(geo["formattedAddress"])
    return ""


def _seller(item: dict) -> str:
    val = str(item.get("sellerType") or "").lower()
    if val in ("company", "shop", "brand"):
        return "shop"
    if val in ("private", "person", "individual"):
        return "private"
    if item.get("isCompany") is True or item.get("companyName"):
        return "shop"
    return ""


def _region(url: str) -> str:
    try:
        parts = [p for p in urlparse(url).path.split("/") if p]
        return parts[0].lower() if parts else ""
    except Exception:
        return ""


def parse_items(html: str, group: dict):
    m = re.search(r'<script[^>]*data-mfe-state[^>]*>(.*?)</script>', html, re.S | re.I)
    if not m:
        return None
    try:
        state = json.loads(m.group(1))
        data = state["loaderData"]["data"]
        nodes = (data.get("catalog") or {}).get("items") or []
    except Exception:
        return None
    want_region = _region(group.get("url") or "")
    pmin = int(group.get("min_price") or 0)
    pmax = int(group.get("max_price") or 0)
    out = []
    now = time.time()
    for it in nodes:
        if not isinstance(it, dict):
            continue
        path = str(it.get("urlPath") or "")
        if not path:
            continue
        url = path if path.startswith("http") else "https://www.avito.ru" + path
        if want_region and want_region not in ("all", "rossiya", "russia"):
            if _region(url) != want_region:
                continue
        price = 0
        pd = it.get("priceDetailed")
        if isinstance(pd, dict) and isinstance(pd.get("value"), (int, float)):
            price = int(pd["value"])
        elif isinstance(it.get("price"), (int, float)):
            price = int(it["price"])
        if price and pmin and price < pmin:
            continue
        if price and pmax and price > pmax:
            continue
        ts = it.get("sortTimeStamp")
        hours = None
        if isinstance(ts, (int, float)) and ts > 1e11:
            hours = max(0, int((now - ts / 1000.0) / 3600))
        out.append({
            "title": str(it.get("title") or "").strip()[:200],
            "price": price,
            "url": url,
            "external_id": str(it.get("id") or ""),
            "city": _city(it)[:100],
            "photos": [p for p in [_image(it.get("images"))] if p][:5],
            "hours_ago": hours,
            "seller_type": _seller(it),
        })
    return out


# ── Состояние «уже видели» ──────────────────────────────────────────────────

def load_state() -> dict:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_state(state: dict) -> None:
    try:
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        log(f"state save: {type(e).__name__}: {e}")


# ── Браузер ─────────────────────────────────────────────────────────────────

def launch(playwright):
    os.makedirs(PROFILE, exist_ok=True)
    ctx = playwright.chromium.launch_persistent_context(
        PROFILE,
        headless=HEADLESS,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--no-first-run",
        ],
        locale="ru-RU",
        timezone_id="Europe/Samara",
        viewport={"width": 1440, "height": 900},
        extra_http_headers={"Accept-Language": "ru-RU,ru;q=0.9"},
    )
    ctx.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        "Object.defineProperty(navigator,'languages',{get:()=>['ru-RU','ru']});"
        "window.chrome = window.chrome || {runtime:{}};"
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    return ctx, page


def navigate(page, url: str) -> bool:
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(1.5)
        return True
    except Exception as e:
        log(f"навигация {url[:70]}: {type(e).__name__}: {str(e)[:80]}")
        return False


def poll_once(ctx, page, group: dict, state: dict) -> None:
    url = group["url"]
    crit_ids = [int(c) for c in (group.get("crit_ids") or [])]
    if not crit_ids:
        return
    if url not in state:
        state[url] = {"seen": [], "baseline": False, "navigated": False}
    st = state[url]
    if not st.get("navigated"):
        if not navigate(page, url):
            return
        st["navigated"] = True
        save_state(state)
    try:
        resp = ctx.request.get(url, timeout=45000,
                               headers={"Referer": url, "Accept-Language": "ru-RU,ru;q=0.9"})
        html = resp.body().decode("utf-8", "ignore")
        status = resp.status
    except Exception as e:
        log(f"запрос {url[:70]}: {type(e).__name__}: {str(e)[:80]}")
        st["navigated"] = False
        return
    if status != 200:
        log(f"HTTP {status} {url[:70]} — обновляю страницу")
        st["navigated"] = False
        return
    items = parse_items(html, group)
    if items is None:
        log(f"нет data-mfe-state {url[:70]} — обновляю страницу")
        st["navigated"] = False
        return
    ids = [it["external_id"] for it in items if it["external_id"]]
    seen = set(st.get("seen") or [])
    if not st.get("baseline"):
        st["seen"] = ids[-MAX_SEEN:]
        st["baseline"] = True
        save_state(state)
        log(f"baseline {len(ids)} карточек · {url[:70]}")
        return
    new = [it for it in items if it["external_id"] and it["external_id"] not in seen]
    if not new:
        return
    try:
        res = send_findings(new, crit_ids)
        log(f"новых {len(new)} → принято {res.get('accepted')}, "
            f"дублей {res.get('duplicate')} · {url[:70]}")
        seen.update(it["external_id"] for it in new)
        st["seen"] = list(seen)[-MAX_SEEN:]
        save_state(state)
    except Exception as e:
        log(f"отправка {len(new)}: {type(e).__name__}: {str(e)[:100]}")


def run_once() -> int:
    groups = fetch_groups()
    if not groups:
        log("нет активных ссылок")
        return 1
    state = load_state()
    with sync_playwright() as pw:
        ctx, page = launch(pw)
        for g in groups:
            poll_once(ctx, page, g, state)
        ctx.close()
    return 0


def main() -> int:
    if not SERVER or not TOKEN:
        log("не заданы POLKA_SERVER / LIVE_WORKER_TOKEN")
        return 2
    log(f"воркер запущен: сервер {SERVER}, профиль {PROFILE}, headless={HEADLESS}")
    state = load_state()
    groups = []
    last_groups = 0.0
    last_hb = 0.0
    next_at = {}
    with sync_playwright() as pw:
        ctx, page = launch(pw)
        while True:
            try:
                now = time.time()
                if now - last_groups > GROUPS_EVERY or not groups:
                    try:
                        groups = fetch_groups()
                        last_groups = now
                        log(f"ссылок в работе: {len(groups)}")
                    except Exception as e:
                        log(f"список ссылок: {type(e).__name__}: {str(e)[:100]}")
                if now - last_hb > HEARTBEAT_EVERY:
                    try:
                        heartbeat()
                        last_hb = now
                    except Exception as e:
                        log(f"heartbeat: {type(e).__name__}: {str(e)[:100]}")
                due = [g for g in groups if next_at.get(g["url"], 0) <= now]
                if not due:
                    time.sleep(0.5)
                    continue
                g = min(due, key=lambda x: next_at.get(x["url"], 0))
                poll_once(ctx, page, g, state)
                interval = max(POLL_MIN, int(g.get("interval") or 60))
                next_at[g["url"]] = time.time() + interval
            except KeyboardInterrupt:
                log("остановлен")
                return 0
            except Exception as e:
                log(f"цикл: {type(e).__name__}: {str(e)[:120]}")
                try:
                    ctx.close()
                except Exception:
                    pass
                time.sleep(3)
                try:
                    ctx, page = launch(pw)
                except Exception as e2:
                    log(f"браузер не поднялся: {type(e2).__name__}: {str(e2)[:100]}")
                    time.sleep(10)


if __name__ == "__main__":
    if "--once" in sys.argv:
        sys.exit(run_once())
    sys.exit(main())
