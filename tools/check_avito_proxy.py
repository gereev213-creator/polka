"""Проверка прокси и ссылки Авито ДО запуска бота (исправленная версия).

    AVITO_PROXIES="http://логин:пароль@188.143.169.27:30260" python3 check_avito_proxy.py "ССЫЛКА_АВИТО"

Шаги: 1) жив ли прокси и какой у него внешний IP; 2) главная Авито;
3) ваша выдача 5 раз подряд. Каждый запрос независим (кулдауны бота не мешают),
печатается настоящий HTTP-код.
"""

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import asyncio, os, sys, time
import avito_live as al
from curl_cffi.requests import AsyncSession

PROFILE = os.environ.get("AVITO_IMPERSONATE", "edge101")


async def req(url, proxy, timeout=30):
    kw = {"impersonate": PROFILE}
    if proxy:
        kw["proxies"] = {"http": proxy, "https": proxy}
    async with AsyncSession(**kw) as s:
        return await s.get(url, timeout=timeout, allow_redirects=True,
                           headers={"Accept-Language": "ru-RU,ru;q=0.9"})


async def main() -> int:
    url = al.normalize_url(sys.argv[1]) if len(sys.argv) > 1 else None
    if not url:
        print(__doc__); return 2
    proxy = next((p.strip() for p in os.environ.get("AVITO_PROXIES", "").split(",") if p.strip()), None)
    print(f"профиль: {PROFILE}\nпрокси: {'есть' if proxy else 'НЕТ'}\n")

    try:
        r = await req("https://api.ipify.org", proxy, 20)
        print(f"[1] внешний IP через прокси: {r.text.strip()} (HTTP {r.status_code})")
    except Exception as e:
        print(f"[1] ✗ прокси не работает: {type(e).__name__}: {e}\n    проверьте логин/пароль/порт и что тариф оплачен"); return 1

    try:
        r = await req("https://www.avito.ru/", proxy)
        print(f"[2] главная Авито: HTTP {r.status_code}, {len(r.text)//1024} КБ")
    except Exception as e:
        print(f"[2] ✗ {type(e).__name__}: {e}")
    await asyncio.sleep(5)

    ok = 0
    for i in range(1, 6):
        t0 = time.time()
        try:
            r = await req(url, proxy)
            if r.status_code != 200:
                print(f"{i}. ✗ HTTP {r.status_code}")
            else:
                page = al.parse_page(r.text)
                if page.recognized and page.items:
                    ok += 1
                    print(f"{i}. OK, объявлений {len(page.items)}, {time.time()-t0:.1f} с")
                else:
                    low = r.text.lower()
                    print(f"{i}. ✗ 200, но " + ("страница блокировки" if any(m in low for m in al.BLOCK_MARKERS) else "вёрстка не распознана"))
        except Exception as e:
            print(f"{i}. ✗ {type(e).__name__}: {e}")
        await asyncio.sleep(8)
    print(f"\nуспешно {ok} из 5")
    return 0 if ok >= 4 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
