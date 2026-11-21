"""Воркер быстрого мониторинга Авито — два канала.

Канал — это отдельный Chromium со своим профилем и IP:
  • домашний  — без прокси;
  • прокси    — через локальный мост HTTP→SOCKS5 (Chromium не умеет
                SOCKS5 с логином/паролем).

Каждый канал держит 6 параллельных запросов. Сервер Полки отдаёт ссылки и
принимает находки; пока воркер жив, серверные ссылочные поиски на прокси не
опрашиваются.

Настройки (start-worker.bat):
  POLKA_SERVER          https://...
  LIVE_WORKER_TOKEN     токен из Amvera
  WORKER_PROFILE_HOME   папка профиля для домашнего канала
  WORKER_PROFILE_PROXY  папка профиля для прокси-канала
  WORKER_PROXY          socks5h://логин:пароль@хост:порт
  WORKER_PARALLEL       6 (запросов одновременно на канал)
  WORKER_HEADLESS       0 (1 — без окна, Авито часто режет)

Запуск:  python worker.py            (цикл)
         python worker.py --once     (одна проверка, для теста)
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime
from typing import Optional
from urllib.parse import unquote, urlparse

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = (os.environ.get("POLKA_SERVER") or "").rstrip("/")
TOKEN = os.environ.get("LIVE_WORKER_TOKEN") or ""
PROFILE_HOME = (os.environ.get("WORKER_PROFILE_HOME")
                or os.environ.get("AVITO_PROFILE")
                or os.path.join(HERE, "profile-home"))
PROFILE_PROXY = os.environ.get("WORKER_PROFILE_PROXY") or os.path.join(HERE, "profile-proxy")
PROXY = (os.environ.get("WORKER_PROXY") or "").strip()
HEADLESS = str(os.environ.get("WORKER_HEADLESS", "0")) == "1"
PARALLEL = max(1, int(os.environ.get("WORKER_PARALLEL", "6")))
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


# ── Сервер Полки ────────────────────────────────────────────────────────────

def _server_call(path: str, payload=None, method: str = "GET"):
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


async def server_call(path: str, payload=None, method: str = "GET"):
    return await asyncio.to_thread(_server_call, path, payload, method)


async def fetch_groups():
    data = await server_call("/api/live/watches")
    return data.get("groups") or []


async def heartbeat(lanes: int):
    return await server_call("/api/live/heartbeat", {"lanes": lanes}, "POST")


async def send_findings(items, crit_ids):
    return await server_call("/api/live/findings", {"items": items, "crit_ids": crit_ids}, "POST")


# ── Мост HTTP → SOCKS5 (для прокси-канала) ─────────────────────────────────

class SocksBridge:
    """Локальный HTTP CONNECT-прокси, который ходит в SOCKS5 с авторизацией."""

    def __init__(self, proxy_url: str):
        u = urlparse(proxy_url if "://" in proxy_url else "socks5h://" + proxy_url)
        self.host = u.hostname or ""
        self.port = int(u.port or 1080)
        self.user = unquote(u.username or "")
        self.password = unquote(u.password or "")
        self.server = None
        self.listen_port = 0

    async def start(self) -> int:
        self.server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        self.listen_port = self.server.sockets[0].getsockname()[1]
        log(f"мост HTTP→SOCKS5: 127.0.0.1:{self.listen_port} → {self.host}:{self.port}")
        return self.listen_port

    async def stop(self):
        if self.server:
            self.server.close()
            try:
                await self.server.wait_closed()
            except Exception:
                pass

    async def _pipe(self, src, dst):
        try:
            while True:
                data = await src.read(65536)
                if not data:
                    break
                dst.write(data)
                await dst.drain()
        except Exception:
            pass
        finally:
            try:
                dst.close()
            except Exception:
                pass

    async def _handle(self, reader, writer):
        upstream = None
        try:
            header = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=15)
            first = header.decode("latin1").split("\r\n", 1)[0]
            method, target, _ = first.split()
            if method.upper() != "CONNECT":
                writer.write(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n")
                await writer.drain()
                writer.close()
                return
            host, port = target.rsplit(":", 1)
            r, w = await asyncio.open_connection(self.host, self.port)
            upstream = (r, w)
            w.write(b"\x05\x02\x00\x02" if self.user else b"\x05\x01\x00")
            await w.drain()
            resp = await r.readexactly(2)
            if resp[1] == 2:
                u = self.user.encode()
                p = self.password.encode()
                w.write(b"\x01" + bytes([len(u)]) + u + bytes([len(p)]) + p)
                await w.drain()
                auth = await r.readexactly(2)
                if auth[1] != 0:
                    raise RuntimeError("socks auth failed")
            elif resp[1] != 0:
                raise RuntimeError(f"socks method {resp[1]}")
            hb = host.encode()
            w.write(b"\x05\x01\x00\x03" + bytes([len(hb)]) + hb + int(port).to_bytes(2, "big"))
            await w.drain()
            rep = await r.readexactly(4)
            if rep[1] != 0:
                raise RuntimeError(f"socks connect {rep[1]}")
            atyp = rep[3]
            if atyp == 1:
                await r.readexactly(4)
            elif atyp == 3:
                n = (await r.readexactly(1))[0]
                await r.readexactly(n)
            elif atyp == 4:
                await r.readexactly(16)
            await r.readexactly(2)
            writer.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
            await writer.drain()
            await asyncio.gather(self._pipe(reader, w), self._pipe(r, writer))
        except Exception as e:
            log(f"мост: {type(e).__name__}: {str(e)[:120]}")
            try:
                writer.write(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                await writer.drain()
            except Exception:
                pass
        finally:
            try:
                writer.close()
            except Exception:
                pass
            if upstream:
                try:
                    upstream[1].close()
                except Exception:
                    pass


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


# ── Состояние ───────────────────────────────────────────────────────────────

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


# ── Каналы ──────────────────────────────────────────────────────────────────

async def launch_lane(pw, name: str, profile: str, proxy_url: Optional[str]):
    os.makedirs(profile, exist_ok=True)
    kwargs = dict(
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
    if proxy_url:
        kwargs["proxy"] = {"server": proxy_url}
    ctx = await pw.chromium.launch_persistent_context(profile, **kwargs)
    await ctx.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
        "Object.defineProperty(navigator,'languages',{get:()=>['ru-RU','ru']});"
        "window.chrome = window.chrome || {runtime:{}};"
    )
    log(f"канал {name}: профиль {profile}"
        + (f", прокси {proxy_url}" if proxy_url else ", без прокси"))
    return ctx


async def poll_group(lane: dict, group: dict, state: dict):
    url = group["url"]
    crit_ids = [int(c) for c in (group.get("crit_ids") or [])]
    if not crit_ids:
        return
    try:
        resp = await lane["ctx"].request.get(
            url, timeout=45000,
            headers={"Referer": url, "Accept-Language": "ru-RU,ru;q=0.9"})
        status = resp.status
        body = (await resp.body()).decode("utf-8", "ignore")
    except Exception as e:
        lane["fails"] = lane.get("fails", 0) + 1
        log(f"{lane['name']}: {type(e).__name__}: {str(e)[:90]} · {url[:60]}")
        return
    if status != 200:
        lane["fails"] = lane.get("fails", 0) + 1
        if lane["name"] == "proxy" and status in (403, 429):
            lane["rotate"] = True
        log(f"{lane['name']}: HTTP {status} · {url[:60]}")
        return
    lane["fails"] = 0
    items = parse_items(body, group)
    if items is None:
        log(f"{lane['name']}: нет data-mfe-state · {url[:60]}")
        return
    if url not in state:
        state[url] = {"seen": [], "baseline": False}
    st = state[url]
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
        res = await send_findings(new, crit_ids)
        log(f"новых {len(new)} → принято {res.get('accepted')}, "
            f"дублей {res.get('duplicate')} · {url[:70]}")
        seen.update(it["external_id"] for it in new)
        st["seen"] = list(seen)[-MAX_SEEN:]
        save_state(state)
    except Exception as e:
        log(f"отправка {len(new)}: {type(e).__name__}: {str(e)[:100]}")


async def poll_batch(lane: dict, batch, state):
    tasks = [poll_group(lane, g, state) for g in batch]
    await asyncio.gather(*tasks, return_exceptions=True)


# ── Основной цикл ───────────────────────────────────────────────────────────

_LAST_ROT = 0.0


async def maybe_rotate():
    """Сменить IP прокси. Провайдер даёт новый IP не чаще раза в 30 секунд."""
    global _LAST_ROT
    url = (os.environ.get("WORKER_ROTATE_URL") or "").strip()
    if not url:
        return
    wait = 30 - (time.time() - _LAST_ROT)
    if wait > 0:
        log(f"ротация IP: пауза {wait:.0f} с (лимит провайдера)")
        await asyncio.sleep(wait)
    _LAST_ROT = time.time()
    try:
        def _get():
            with urllib.request.urlopen(url, timeout=40) as r:
                return json.loads(r.read().decode("utf-8", "ignore"))
        data = await asyncio.to_thread(_get)
        rt = float(data.get("rt") or 12)
        log(f"смена IP прокси: новый {data.get('new_ip')}, жду {rt + 4:.0f} с")
        await asyncio.sleep(rt + 4)
    except Exception as e:
        log(f"смена IP: {type(e).__name__}: {str(e)[:80]}")


async def run_once() -> int:
    if PROXY:
        await maybe_rotate()
    groups = await fetch_groups()
    if not groups:
        log("нет активных ссылок")
        return 1
    state = load_state()
    bridge = None
    lanes = []
    async with async_playwright() as pw:
        if PROXY:
            bridge = SocksBridge(PROXY)
            port = await bridge.start()
        else:
            port = None
        lanes.append({"name": "home", "ctx": await launch_lane(pw, "home", PROFILE_HOME, None),
                      "fails": 0})
        if port and os.path.isdir(PROFILE_PROXY):
            lanes.append({"name": "proxy",
                          "ctx": await launch_lane(pw, "proxy", PROFILE_PROXY,
                                                   f"http://127.0.0.1:{port}"),
                          "fails": 0})
        else:
            log("прокси-канал не включён (нет WORKER_PROXY или папки профиля)")
        for i in range(0, len(groups), PARALLEL):
            batch = groups[i:i + PARALLEL]
            lane = lanes[(i // PARALLEL) % len(lanes)]
            await poll_batch(lane, batch, state)
        for lane in lanes:
            await lane["ctx"].close()
        if bridge:
            await bridge.stop()
    return 0


async def main() -> int:
    if not SERVER or not TOKEN:
        log("не заданы POLKA_SERVER / LIVE_WORKER_TOKEN")
        return 2
    if PROXY:
        await maybe_rotate()
    lanes = [{"name": "home", "profile": PROFILE_HOME, "proxy": None}]
    bridge = None
    proxy_port = None
    if PROXY and os.path.isdir(PROFILE_PROXY):
        try:
            bridge = SocksBridge(PROXY)
            proxy_port = await bridge.start()
            lanes.append({"name": "proxy", "profile": PROFILE_PROXY,
                          "proxy": f"http://127.0.0.1:{proxy_port}"})
        except Exception as e:
            log(f"мост не поднялся: {type(e).__name__}: {str(e)[:100]}")
            bridge = None
    else:
        log("второй канал не включён: нет WORKER_PROXY или папки профиля прокси")
    log(f"воркер запущен: сервер {SERVER}, каналов {len(lanes)}, "
        f"параллельно {PARALLEL} на канал, headless={HEADLESS}")

    state = load_state()
    groups = []
    last_groups = 0.0
    last_hb = 0.0
    next_at = {}
    async with async_playwright() as pw:
        active = []
        for spec in lanes:
            try:
                ctx = await launch_lane(pw, spec["name"], spec["profile"], spec["proxy"])
                active.append({"name": spec["name"], "ctx": ctx, "fails": 0})
            except Exception as e:
                log(f"канал {spec['name']} не поднялся: {type(e).__name__}: {str(e)[:100]}")
        while True:
            try:
                now = time.time()
                if now - last_groups > GROUPS_EVERY or not groups:
                    try:
                        groups = await fetch_groups()
                        last_groups = now
                        log(f"ссылок в работе: {len(groups)}")
                    except Exception as e:
                        log(f"список ссылок: {type(e).__name__}: {str(e)[:100]}")
                if not active:
                    log("нет живых каналов — останавливаюсь, сервер подхватит на прокси")
                    return 3
                if now - last_hb > HEARTBEAT_EVERY:
                    try:
                        await heartbeat(len(active))
                        last_hb = now
                    except Exception as e:
                        log(f"heartbeat: {type(e).__name__}: {str(e)[:100]}")
                due = sorted([g for g in groups if next_at.get(g["url"], 0) <= now],
                             key=lambda x: next_at.get(x["url"], 0))
                if not due or not active:
                    await asyncio.sleep(0.3)
                    continue
                # Раздаём должников по каналам порциями до PARALLEL
                batches = []
                rest = due
                for lane in active:
                    if not rest:
                        break
                    batch = rest[:PARALLEL]
                    rest = rest[PARALLEL:]
                    batches.append((lane, batch))
                tasks = []
                for lane, batch in batches:
                    for g in batch:
                        next_at[g["url"]] = now + max(POLL_MIN, int(g.get("interval") or 60))
                    tasks.append(poll_batch(lane, batch, state))
                await asyncio.gather(*tasks, return_exceptions=True)
                # канал, который стабильно бьётся: прокси — меняем IP и
                # перезапускаем, домашний — выключаем, второй возьмёт всё.
                for lane in list(active):
                    if lane.get("rotate") and lane["name"] == "proxy" and os.environ.get("WORKER_ROTATE_URL"):
                        lane["rotate"] = False
                        log("прокси 403/429 — меняю IP")
                        await maybe_rotate()
                        try:
                            await lane["ctx"].close()
                        except Exception:
                            pass
                        try:
                            lane["ctx"] = await launch_lane(
                                pw, "proxy", PROFILE_PROXY,
                                f"http://127.0.0.1:{proxy_port}")
                            lane["fails"] = 0
                            log("прокси-канал перезапущен на новом IP")
                            continue
                        except Exception as e:
                            log(f"прокси-канал не поднялся: {type(e).__name__}: {str(e)[:100]}")
                    if lane.get("fails", 0) < 8:
                        continue
                    if lane["name"] == "proxy" and os.environ.get("WORKER_ROTATE_URL"):
                        log("прокси-канал: меняю IP после проверок Авито")
                        await maybe_rotate()
                        try:
                            await lane["ctx"].close()
                        except Exception:
                            pass
                        try:
                            lane["ctx"] = await launch_lane(
                                pw, "proxy", PROFILE_PROXY,
                                f"http://127.0.0.1:{proxy_port}")
                            lane["fails"] = 0
                            log("прокси-канал перезапущен на новом IP")
                            continue
                        except Exception as e:
                            log(f"прокси-канал не поднялся: {type(e).__name__}: {str(e)[:100]}")
                    log(f"канал {lane['name']} отключён после 8 ошибок")
                    try:
                        await lane["ctx"].close()
                    except Exception:
                        pass
                    active.remove(lane)
            except KeyboardInterrupt:
                log("остановлен")
                return 0
            except Exception as e:
                log(f"цикл: {type(e).__name__}: {str(e)[:120]}")
                await asyncio.sleep(5)
    if bridge:
        await bridge.stop()


if __name__ == "__main__":
    if "--once" in sys.argv:
        sys.exit(asyncio.run(run_once()))
    sys.exit(asyncio.run(main()))
