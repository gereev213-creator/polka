"""Живая проверка avito_live: прокси → выдача → разбор → baseline → новая находка.

    AVITO_PROXIES="socks5h://логин:пароль@хост:порт" \
    AVITO_IMPERSONATE=edge101 python3 live_smoke.py "ССЫЛКА_АВИТО"

Никуда не отправляет: sink печатает в консоль. База — во временном каталоге.
Ссылка по умолчанию — та, что в тестах (iPhone 15 Pro, Москва, с фильтрами).
"""

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import asyncio
import os
import sys
import tempfile
import time

import avito_live as al

DEFAULT_LINK = (
    "https://m.avito.ru/all/telefony/mobilnye_telefony/apple/iphone_15_pro-ASgBAgICA0SywA2Sn~0RtMANzqs5sMENiPw3"
    "?context=H4sIAAAAAAAA_wE-AMH_YToyOntzOjk6ImZyb21fcGFnZSI7czo3OiJmaWx0ZXJzIjtzOjE0OiJoYXNFeHRyYVBhcmFtcyI7YjoxO302Cz8HPgAAAA"
    "&f=ASgBAQECA0SywA2Sn~0RtMANzqs5sMENiPw3AUDo6w40~P3bAvr92wL8_dsCAkXGmgwVeyJmcm9tIjowLCJ0byI6MzUwMDB9"
    "gu4OFXsiZnJvbSI6ODAsInRvIjpudWxsfQ&geoCoords=55.755814%2C37.617635&moreExpensive=0&presentationType=serp&radius=0&user=1"
)


async def main() -> int:
    raw = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LINK
    url = al.normalize_url(raw)
    if not url:
        print("Нужна ссылка на выдачу Авито. Пример:\n  " + DEFAULT_LINK)
        return 2
    proxies = [p.strip() for p in os.environ.get("AVITO_PROXIES", "").split(",") if p.strip()]
    profile = os.environ.get("AVITO_IMPERSONATE", "edge101")
    print(f"профиль: {profile}")
    print(f"прокси:  {'задан' if proxies else 'НЕТ'}")
    print(f"ссылка:  {url[:100]}…\n")

    fetcher = al.Fetcher(proxies, timeout=float(os.environ.get("AVITO_TIMEOUT", "45")))

    # 1. Одна выдача: жив ли прокси, распознаётся ли страница.
    t0 = time.time()
    try:
        html = await fetcher.get(url)
    except al.Blocked as e:
        print(f"1) БЛОКИРОВКА: {e}")
        return 1
    except al.FetchError as e:
        print(f"1) ОШИБКА: {e}")
        return 1
    page = al.parse_page(html)
    print(f"1) страница получена: {len(html) // 1024} КБ за {time.time() - t0:.1f} c")
    print(f"   распознана: {page.recognized}, карточек: {len(page.items)}")
    if not page.items:
        print("   → разбор не дал карточек, дальше проверять нечего")
        return 1
    with_ts = sum(1 for i in page.items if i.ts)
    with_img = sum(1 for i in page.items if i.image)
    print(f"   с временем (sortTimeStamp): {with_ts} из {len(page.items)}")
    print(f"   с фото: {with_img} из {len(page.items)}")
    for it in sorted(page.items, key=lambda i: i.ts or 0, reverse=True)[:3]:
        print(f"   · id={it.id} price={it.price} loc={it.location!r} ts={it.ts} {it.title[:45]!r}")

    # 2. Хранилище, baseline и отправка «нового».
    store = al.Store(os.path.join(tempfile.mkdtemp(), "smoke.db"))
    sent = []

    async def sink(watch, item):
        sent.append(item.id)
        print(f"   → ОТПРАВКА id={item.id} price={item.price} {item.title[:50]!r}")

    watcher = al.LiveWatcher(store, fetcher, sink, interval=1)
    wid = store.add_watch(1, url)
    try:
        await watcher.poll_url(url, store.active_by_url()[url])
    except (al.Blocked, al.FetchError, al.NoProxy) as e:
        print(f"\n2) baseline не удался: {type(e).__name__}: {e}")
        return 1
    print(f"\n2) baseline: отправлено {len(sent)} (должно быть 0)")
    if sent:
        print("   ✗ baseline не должен ничего слать")
        return 1

    # Снимаем отметку с самого свежего лота — он обязан прийти как новый.
    newest = max(page.items, key=lambda i: i.ts or 0)
    # На узком поиске свежих лотов может не быть вовсе. Тогда на время
    # проверки отправки снимаем возрастной фильтр — он проверяется отдельно.
    age = newest.age()
    old_limit = al.MAX_AGE_SEC
    if age is not None and age > old_limit:
        print(f"   (самый свежий лот старше {old_limit / 3600:.0f} ч — "
              f"на время проверки отправки фильтр возраста снят)")
        al.MAX_AGE_SEC = 10 ** 9
    store._q("DELETE FROM live_seen WHERE watch_id=? AND item_id=?", (wid, newest.id))
    await asyncio.sleep(5)
    try:
        await watcher.poll_url(url, store.active_by_url()[url])
    except (al.Blocked, al.FetchError, al.NoProxy) as e:
        print(f"3) опрос не удался: {type(e).__name__}: {e}")
        return 1
    finally:
        al.MAX_AGE_SEC = old_limit
    print(f"3) после снятия отметки с id={newest.id}: отправлено {len(sent)}")
    if not (1 <= len(sent) <= al.MAX_BURST) or newest.id not in sent:
        print("   ✗ нужная находка не ушла (или отправлено больше лимита за опрос)")
        return 1
    if len(sent) > 1:
        print(f"   (на выдаче появились ещё {len(sent) - 1} новых — это норма, "
              f"лимит {al.MAX_BURST} за опрос)")
    if newest.ts is None:
        print("   ⚠ у лота нет времени — фильтр «старше 6 ч» на этой выдаче не работает")

    print("\nИТОГ: парсер жив — выдача читается, baseline не шумит, новая находка уходит.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
