"""Подбор профиля браузера для curl_cffi: какой из них Авито пускает.

    AVITO_PROXIES="socks5h://логин:пароль@хост:порт" python3 check_avito_profiles.py

Запрашивает ТОЛЬКО главную страницу, по одному разу на профиль, с паузами:
без прокси и через прокси. Печатает код и первые слова страницы-заглушки.
"""

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import asyncio
import os
import re
import sys

from curl_cffi.requests import AsyncSession, BrowserType

URL = "https://www.avito.ru/"


def profiles():
    names = sorted({b.value for b in BrowserType})
    pick = []
    for fam in ("chrome", "safari", "firefox", "edge"):
        fam_names = [n for n in names if n.startswith(fam) and "android" not in n and "ios" not in n]
        fam_names.sort(key=lambda n: [int(x) for x in re.findall(r"\d+", n)] or [0])
        pick += fam_names[-2:] if fam == "chrome" else fam_names[-1:]
    cur = os.environ.get("AVITO_IMPERSONATE", "chrome124")
    if cur in names and cur not in pick:
        pick.append(cur)
    return pick


def snippet(text):
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()[:110]


async def one(profile, proxy):
    kw = {"impersonate": profile}
    if proxy:
        kw["proxies"] = {"http": proxy, "https": proxy}
    try:
        async with AsyncSession(**kw) as s:
            r = await s.get(URL, timeout=30, allow_redirects=True,
                            headers={"Accept-Language": "ru-RU,ru;q=0.9"})
        ok = r.status_code == 200 and "__initialData__" in r.text
        return f"{r.status_code}{' ✓' if ok else ''} · {len(r.text) // 1024} КБ", snippet(r.text) if r.status_code != 200 else ""
    except Exception as e:
        return f"ошибка {type(e).__name__}", ""


async def main():
    proxy = (os.environ.get("AVITO_PROXIES", "").split(",")[0].strip()) or None
    print(f"прокси: {'есть' if proxy else 'нет'}\n")
    print(f"{'профиль':20} | {'без прокси':16} | через прокси")
    print("-" * 70)
    first_note = None
    for p in profiles():
        d, note = await one(p, None)
        await asyncio.sleep(5)
        v, note2 = await one(p, proxy) if proxy else ("—", "")
        print(f"{p:20} | {d:16} | {v}")
        first_note = first_note or note or note2
        await asyncio.sleep(5)
    if first_note:
        print(f"\nтекст страницы-заглушки: «{first_note}»")


asyncio.run(main())
