"""Сравнительная проверка: какие адреса Авито отдаёт с прокси и без.

    AVITO_PROXIES="socks5h://логин:пароль@хост:порт" python3 check_avito_matrix.py "ВАША_ССЫЛКА"

Для каждого адреса делает по одному запросу БЕЗ прокси (ваш домашний IP) и ЧЕРЕЗ прокси,
печатает код ответа, размер и число объявлений. По таблице видно, что именно режется:
IP прокси, любой запрос с парсера или только конкретная ссылка.
"""

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import asyncio
import os
import re
import sys
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

import avito_live as al


def variants(raw: str):
    full = al.normalize_url(raw)
    u = urlparse(full)
    q = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if k != "context"]
    no_ctx = urlunparse(("https", "www.avito.ru", u.path, "", urlencode(q, safe=",:"), ""))
    return [
        ("главная avito.ru", "https://www.avito.ru/"),
        ("раздел «телефоны» СПб", "https://www.avito.ru/sankt-peterburg/telefony?s=104"),
        ("ваша ссылка без context=", no_ctx),
        ("ваша ссылка целиком", full),
    ]


async def one(url, proxy):
    from curl_cffi.requests import AsyncSession
    kw = {"impersonate": os.environ.get("AVITO_IMPERSONATE", "edge101")}
    if proxy:
        kw["proxies"] = {"http": proxy, "https": proxy}
    try:
        async with AsyncSession(**kw) as s:
            r = await s.get(url, timeout=30, allow_redirects=True,
                            headers={"Accept-Language": "ru-RU,ru;q=0.9"})
        n = len(al.parse_page(r.text).items) if r.status_code == 200 else 0
        return f"{r.status_code} · {len(r.text) // 1024} КБ · объявл. {n}"
    except Exception as e:
        return f"ошибка: {type(e).__name__}"


async def main():
    if len(sys.argv) < 2 or not al.normalize_url(sys.argv[1]):
        print(__doc__)
        return
    proxy = (os.environ.get("AVITO_PROXIES", "").split(",")[0].strip()) or None
    print(f"прокси: {'есть' if proxy else 'НЕТ — задайте AVITO_PROXIES'}\n")
    print(f"{'адрес':28} | {'без прокси':30} | через прокси")
    print("-" * 100)
    for name, url in variants(sys.argv[1]):
        direct = await one(url, None)
        await asyncio.sleep(4)
        via = await one(url, proxy) if proxy else "—"
        print(f"{name:28} | {direct:30} | {via}")
        await asyncio.sleep(4)


asyncio.run(main())
