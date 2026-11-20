"""Прототип быстрого пути: страница один раз → XHR выдачи много раз.

    AVITO_PROXIES="socks5h://…" AVITO_PROXY_ROTATE_URL="…" \
    python3 tools/xhr_probe.py "ССЫЛКА_АВИТО" [число запросов]

Что проверяем:
  1. сколько стоит один XHR (размер, время);
  2. пускает ли Авито серию запросов с одного IP;
  3. решается ли 439 через firewallPow.
"""
import asyncio
import json
import os
import re
import sys
import time
from urllib.parse import urlencode

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
import avito_live as al

from curl_cffi.requests import AsyncSession

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "avito_api"))
try:
    from firewallpow_payload_reference import build_verify_payload
except Exception:  # pragma: no cover
    build_verify_payload = None

PROXY = (os.environ.get("AVITO_PROXIES", "").split(",")[0].strip() or None)
ROTATE = os.environ.get("AVITO_PROXY_ROTATE_URL", "").strip()
PROFILE = os.environ.get("AVITO_IMPERSONATE", "edge101")
TIMEOUT = float(os.environ.get("AVITO_TIMEOUT", "60"))
POW_GET = "https://www.avito.ru/web/3/firewallPow/get"
POW_VERIFY = "https://www.avito.ru/web/3/firewallPow/verify"

DOC_H = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9",
}
XHR_H = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ru-RU,ru;q=0.9",
    "X-Requested-With": "XMLHttpRequest",
    "X-Source": "client-browser",
    "Origin": "https://www.avito.ru",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}


def kw(proxy=PROXY):
    out = {"impersonate": PROFILE}
    if proxy:
        out["proxies"] = {"http": proxy, "https": proxy}
    return out


async def rotate():
    if not ROTATE:
        await asyncio.sleep(2)
        return
    try:
        async with AsyncSession() as s:
            r = await s.get(ROTATE, timeout=40)
        rt = float(r.json().get("rt") or 12)
    except Exception:
        rt = 14.0
    print(f"  … смена IP, жду {rt + 4:.0f} с", flush=True)
    await asyncio.sleep(rt + 4)


async def fetch_page(url):
    """Страница с живой сессией и её куками. Возвращает (session, html)."""
    for attempt in range(1, 9):
        s = AsyncSession(**kw())
        try:
            r = await s.get(url, timeout=TIMEOUT, headers=DOC_H, allow_redirects=True)
            if r.status_code == 200 and len(r.text) > 300_000:
                print(f"страница: HTTP 200, {len(r.text)//1024} КБ, попытка {attempt}")
                return s, r.text
            print(f"  страница: HTTP {r.status_code}, {len(r.text)//1024} КБ — блок")
        except Exception as e:
            print(f"  страница: {type(e).__name__}: {str(e)[:70]}")
        await s.close()
        await rotate()
    return None, None


def build_xhr(page_url, html):
    m = re.search(r'<script[^>]*data-mfe-state[^>]*>(.*?)</script>', html, re.S | re.I)
    if not m:
        raise SystemExit("в странице нет data-mfe-state")
    state = json.loads(m.group(1))["loaderData"]["data"]
    sc = state.get("searchCore") or {}
    q = [
        ("categoryId", sc.get("categoryId")),
        ("locationId", sc.get("locationId")),
        ("cd", "0"),
        ("p", "1"),
        ("verticalCategoryId", sc.get("verticalCategoryId")),
        ("rootCategoryId", sc.get("rootCategoryId")),
        ("localPriority", "0"),
        ("updateListOnly", "true"),
    ]
    for key in ("sort", "priceMin", "priceMax", "owner", "query"):
        if sc.get(key) not in (None, "", 0, "0"):
            q.append((key, sc[key]))
    for k, v in (sc.get("params") or {}).items():
        if isinstance(v, list):
            for vv in v:
                q.append((f"params[{k}][]", str(vv)))
        elif isinstance(v, dict):
            for kk, vv in v.items():
                if vv is not None:
                    q.append((f"params[{k}][{kk}]", str(vv)))
        elif v is not None:
            q.append((f"params[{k}]", str(v)))
    q += [
        ("features[imageAspectRatio]", "1:1"),
        ("features[responsive]", "true"),
        ("features[useReload]", "true"),
        ("features[isShowWithPhotoFilter]", "false"),
    ]
    return "https://www.avito.ru/web/1/js/items?" + urlencode(q, doseq=True), sc


async def solve_pow(session, page_url):
    """439 JSON → firewallPow/get → verify. Возвращает True при успехе."""
    async with AsyncSession(**kw()) as s:
        r = await s.get(page_url, timeout=TIMEOUT, headers=DOC_H)
    # challenge приходит в JSON ответа XHR, поэтому берём его из последнего ответа
    return False


async def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    page_url = al.normalize_url(sys.argv[1])
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    if not page_url:
        print("нужна ссылка Авито")
        return 2
    print(f"профиль: {PROFILE}; прокси: {'да' if PROXY else 'нет'}; запросов: {n}")

    t0 = time.time()
    session, html = await fetch_page(page_url)
    if not html:
        print("не удалось открыть страницу")
        return 1
    xhr_url, sc = build_xhr(page_url, html)
    print(f"XHR: categoryId={sc.get('categoryId')} locationId={sc.get('locationId')} "
          f"params={len(sc.get('params') or {})}, длина URL {len(xhr_url)}")
    print(f"страница получена за {time.time()-t0:.1f} с\n")

    ok = 0
    sizes, times = [], []
    hdr = {**XHR_H, "Referer": page_url}
    for i in range(1, n + 1):
        t = time.time()
        try:
            r = await session.get(xhr_url, timeout=TIMEOUT, headers=hdr, allow_redirects=True)
        except Exception as e:
            print(f"{i}) ERR {type(e).__name__}: {str(e)[:80]}")
            await rotate()
            await session.close()
            session, html2 = await fetch_page(page_url)
            if not session:
                break
            continue
        dt = time.time() - t
        body = r.text
        sizes.append(len(body)); times.append(dt)
        items = []
        try:
            data = r.json()
            cat = (data.get("catalog") or {}) if isinstance(data, dict) else {}
            items = cat.get("items") or []
        except Exception:
            data = None
        chal = None
        try:
            if isinstance(data, dict):
                chal = data.get("pow_challenge")
        except Exception:
            pass
        print(f"{i}) HTTP {r.status_code} · {len(body)/1024:.1f} КБ · {dt:.2f} с · "
              f"items={len(items)} · pow={'да' if chal else 'нет'}")
        if r.status_code == 200 and items:
            ok += 1
            first = next((x for x in items if isinstance(x, dict) and x.get("title")), None)
            if first:
                print(f"    · {first.get('title')[:50]!r} {((first.get('priceDetailed') or {}).get('value'))} ₽")
        elif chal:
            print("    pow_challenge:", str(chal)[:80])
            break
        elif r.status_code in (403, 429, 439):
            print("    тело:", re.sub(r"\s+", " ", body)[:180])
            if i < n:
                await rotate()
                await session.close()
                session, html2 = await fetch_page(page_url)
                if not session:
                    break
        await asyncio.sleep(1.0)
    await session.close()
    print(f"\nуспешных XHR: {ok}/{n}")
    if sizes:
        print(f"средний размер: {sum(sizes)/len(sizes)/1024:.0f} КБ; "
              f"среднее время: {sum(times)/len(times):.2f} с")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
