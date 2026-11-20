"""Проверка: пускает ли Авито поиск, если сначала открыть главную В ТОЙ ЖЕ сессии (с куками).

    AVITO_PROXIES="socks5h://логин:пароль@хост:порт" python3 check_avito_session.py "ССЫЛКА_АВИТО"

Для каждого профиля браузера: внешний IP -> главная -> поиск -> поиск (одна сессия, один IP).
Вся серия по профилю укладывается в ~15 секунд, пока мобильный IP не сменился.
"""

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import asyncio
import os
import sys

import avito_live as al
from curl_cffi.requests import AsyncSession

PROFILES = ["edge101", "chrome124", "chrome131", "chrome146", "safari2601"]
H = {"Accept-Language": "ru-RU,ru;q=0.9"}


def tag(r):
    ok = r.status_code == 200 and "__initialData__" in r.text
    return f"{r.status_code}{' ✓' if ok else ''}/{len(r.text) // 1024}КБ"


async def run(profile, url, proxy):
    kw = {"impersonate": profile}
    if proxy:
        kw["proxies"] = {"http": proxy, "https": proxy}
    try:
        async with AsyncSession(**kw) as s:
            ip = (await s.get("https://api.ipify.org", timeout=20)).text.strip()
            home = await s.get("https://www.avito.ru/", timeout=30, headers=H, allow_redirects=True)
            await asyncio.sleep(2)
            s1 = await s.get(url, timeout=30, headers=H, allow_redirects=True)
            await asyncio.sleep(2)
            s2 = await s.get(url, timeout=30, headers=H, allow_redirects=True)
            n = len(al.parse_page(s2.text).items) if s2.status_code == 200 else 0
            cookies = ",".join(sorted(s.cookies.keys()))[:60]
        print(f"{profile:11} ip={ip:15} главная {tag(home):12} поиск {tag(s1):12} поиск {tag(s2):12} объявл.{n}")
        print(f"{'':11} куки: {cookies}")
    except Exception as e:
        print(f"{profile:11} ✗ {type(e).__name__}: {str(e)[:80]}")


async def main():
    url = al.normalize_url(sys.argv[1]) if len(sys.argv) > 1 else None
    if not url:
        print(__doc__)
        return
    proxy = next((p.strip() for p in os.environ.get("AVITO_PROXIES", "").split(",") if p.strip()), None)
    print(f"прокси: {'есть' if proxy else 'НЕТ'}\n")
    for p in PROFILES:
        await run(p, url, proxy)
        await asyncio.sleep(6)


asyncio.run(main())
