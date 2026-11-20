"""Офлайн-тесты avito_live на синтетической странице (в реальный Авито не ходят)."""
import asyncio
import json
import time
from urllib.parse import quote

import os
import sys

try:
    import pytest
except ImportError:                     # в образе pytest нет — подставляем минимум
    import contextlib

    class pytest:                       # noqa: N801
        @staticmethod
        @contextlib.contextmanager
        def raises(exc):
            try:
                yield
            except exc:
                return
            raise AssertionError("DID NOT RAISE")

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import avito_live as al


def make_page(items):
    data = {"state": {"data": {"catalog": {"items": items}}}, "other": [{"id": 5, "title": "баннер"}]}
    return 'x<script>window.__initialData__ = "' + quote(json.dumps(data)) + '";</script>'


def item(i, title="Куртка", price=1500, age=5, **kw):
    d = {
        "id": i, "title": title, "urlPath": f"/moskva/odezhda/{title.lower()}_{i}",
        "priceDetailed": {"value": price}, "sortTimeStamp": int((time.time() - age) * 1000),
        "images": [{"208x156": "https://img/s.jpg", "640x480": "https://img/b.jpg"}],
        "location": {"name": "Москва"}, "description": "Отличное состояние",
    }
    d.update(kw)
    return d


class FakeFetcher:
    def __init__(self):
        self.pages = []
        self.calls = 0

    async def get(self, url):
        self.calls += 1
        p = self.pages.pop(0) if len(self.pages) > 1 else self.pages[0]
        if isinstance(p, Exception):
            raise p
        return p


def test_normalize_url():
    u = al.normalize_url("смотри https://m.avito.ru/moskva/odezhda?pmax=2000&s=1&p=3&f=ASgB,x")
    assert u.startswith("https://www.avito.ru/moskva/odezhda?")
    assert "s=104" in u and "s=1&" not in u and "p=3" not in u and "pmax=2000" in u
    assert al.normalize_url("https://evil.com/avito.ru/x") is None
    assert al.normalize_url("https://www.avito.ru/") is None
    assert al.normalize_url("привет") is None


def test_parse_page():
    page = al.parse_page(make_page([item(1), item(2, price=0), item(1)]))
    assert page.recognized and [i.id for i in page.items] == [1, 2]
    a = page.items[0]
    assert a.price == 1500 and a.image == "https://img/b.jpg" and a.location == "Москва"
    assert a.url == "https://www.avito.ru/moskva/odezhda/куртка_1"
    assert al.parse_page("<html>что-то другое</html>").recognized is False


def test_format_message_escapes():
    it = al.Listing(1, "<b>x</b>", 12345, "u", description="a & b")
    msg = al.format_message(it)
    assert "&lt;b&gt;" in msg and "12 345 ₽" in msg and "a &amp; b" in msg


def _setup(tmp_path):
    store = al.Store(str(tmp_path / "t.db"))
    got = []

    async def sink(w, it):
        got.append((w.id, it.id))

    fetcher = FakeFetcher()
    watcher = al.LiveWatcher(store, fetcher, sink)
    url = al.normalize_url("https://www.avito.ru/moskva/odezhda?q=куртка")
    wid = store.add_watch(7, url)
    return store, watcher, fetcher, got, url, wid


def test_baseline_then_only_new(tmp_path):
    store, watcher, fetcher, got, url, wid = _setup(tmp_path)
    fetcher.pages = [make_page([item(1), item(2)]),
                     make_page([item(3, age=2), item(1), item(2)]),
                     make_page([item(3), item(1), item(2)])]

    async def go():
        ws = store.active_by_url()[url]
        await watcher.poll_url(url, ws)                 # baseline: ничего не шлём
        assert got == []
        await watcher.poll_url(url, store.active_by_url()[url])
        assert got == [(wid, 3)]
        await watcher.poll_url(url, store.active_by_url()[url])
        assert got == [(wid, 3)]                        # повторно не шлём

    asyncio.run(go())


def test_old_items_and_burst_limits(tmp_path):
    store, watcher, fetcher, got, url, wid = _setup(tmp_path)
    fresh = [item(100 + i, age=i + 1) for i in range(15)]
    stale = item(999, age=al.MAX_AGE_SEC + 600)
    fetcher.pages = [make_page([item(1)]), make_page(fresh + [stale, item(1)])]

    async def go():
        await watcher.poll_url(url, store.active_by_url()[url])
        await watcher.poll_url(url, store.active_by_url()[url])

    asyncio.run(go())
    ids = [i for _, i in got]
    assert len(ids) == al.MAX_BURST and 999 not in ids
    assert ids == sorted(ids, key=lambda i: -(i - 100))  # от старых к свежим: сначала больший age


def test_blocked_and_unrecognized(tmp_path):
    store, watcher, fetcher, got, url, wid = _setup(tmp_path)

    async def go():
        fetcher.pages = ["<html>Доступ ограничен: проблема с IP</html>"]
        with pytest.raises(al.Blocked):
            await watcher.poll_url(url, store.active_by_url()[url])
        fetcher.pages = ["<html>ok но вёрстка другая</html>"]
        with pytest.raises(al.FetchError):
            await watcher.poll_url(url, store.active_by_url()[url])
        # неудачные опросы не должны ставить baseline
        assert store.active_by_url()[url][0].baseline_done is False

    asyncio.run(go())


def test_two_users_share_one_fetch(tmp_path):
    store = al.Store(str(tmp_path / "t.db"))
    got = []

    async def sink(w, it):
        got.append((w.user_id, it.id))

    fetcher = FakeFetcher()
    fetcher.pages = [make_page([item(1)]), make_page([item(2, age=1), item(1)])]
    watcher = al.LiveWatcher(store, fetcher, sink)
    url = al.normalize_url("https://www.avito.ru/moskva/odezhda?q=a")
    store.add_watch(1, url)
    store.add_watch(2, url)

    async def go():
        await watcher.poll_url(url, store.active_by_url()[url])
        await watcher.poll_url(url, store.active_by_url()[url])

    asyncio.run(go())
    assert fetcher.calls == 2 and sorted(got) == [(1, 2), (2, 2)]


def test_store_dedupe_and_remove(tmp_path):
    store = al.Store(str(tmp_path / "t.db"))
    url = al.normalize_url("https://www.avito.ru/moskva/odezhda?q=a")
    a = store.add_watch(1, url)
    assert store.add_watch(1, url) == a
    assert store.remove_watch(a, user_id=2) is False
    assert store.remove_watch(a, user_id=1) is True
    assert store.active_by_url() == {}


def test_run_loop_polls_new_url_immediately(tmp_path):
    store, watcher, fetcher, got, url, wid = _setup(tmp_path)
    fetcher.pages = [make_page([item(1)]), make_page([item(2, age=1), item(1)])]

    async def go():
        t = asyncio.create_task(watcher.run())
        await asyncio.sleep(0.3)
        assert fetcher.calls == 1                       # сразу, без ожидания периода
        watcher._next[url] = 0                          # форсируем следующий опрос
        await asyncio.sleep(1.5)
        watcher.stop()
        await asyncio.sleep(1.2)
        t.cancel()

    asyncio.run(go())
    assert got == [(wid, 2)]


# ---------- интеграция с поисками бота ----------

def test_main_catalog_only_not_recommendations():
    data = {"state": {"data": {"catalog": {"items": [item(1), item(2)]},
                               "recommendations": [item(77, title="Чужой")],
                               "extra": {"items": [item(88, title="Другой регион")]}}}}
    page = 'x<script>window.__initialData__ = "' + quote(json.dumps(data)) + '";</script>'
    assert [i.id for i in al.parse_page(page).items] == [1, 2]


def test_no_catalog_does_not_grab_foreign_nodes():
    """В JSON нет catalog.items — не тащим «похожие» из соседних блоков."""
    data = {"foo": {"list": [item(5), item(6)]}}
    page = 'x<script>window.__initialData__ = "' + quote(json.dumps(data)) + '";</script>'
    assert al.parse_page(page).items == []


def test_parse_microdata_cards():
    """Авито больше не отдаёт __initialData__: карточки читаем из разметки."""
    html = '''
    <div data-marker="item" data-item-id="111" itemscope itemType="http://schema.org/Product">
      <a itemprop="url" href="/moskva/odezhda/kurtka_111">
        <img itemProp="image" alt="Куртка Nike" src="https://10.img.avito.st/a.jpg">
      </a>
      <span class="priceLabelGrid">1 500 ₽</span>
      <div data-marker="item-date">2 часа назад</div>
    </div>
    <div data-marker="item" data-item-id="222">
      <a itemprop="url" href="/moskva/odezhda/kurtka_222">
        <img itemprop="image" alt="Куртка Adidas" src="https://20.img.avito.st/b.jpg">
      </a>
      <span class="priceLabelGrid">2 000 ₽</span>
      <div data-marker="item-date">вчера</div>
    </div>
    '''
    page = al.parse_page(html)
    assert page.recognized and [i.id for i in page.items] == [111, 222]
    a, b = page.items
    assert a.price == 1500 and a.image.endswith("a.jpg")
    assert a.url == "https://www.avito.ru/moskva/odezhda/kurtka_111"
    assert 1.9 < a.age() / 3600 < 2.1
    assert b.price == 2000 and 23.9 < b.age() / 3600 < 24.1


def test_mfe_state_takes_main_catalog_only():
    """Новый формат: data-mfe-state → catalog.items, без extraBlockItems."""
    main = [item(11), item(12)]
    extra = [item(99, title="Чужой регион")]
    state = {"loaderData": {"data": {"catalog": {"items": main,
                                                 "extraBlockItems": extra}}}}
    page = ('<script type="mime/invalid" data-mfe-state="true">'
            + json.dumps(state) + '</script>')
    parsed = al.parse_page(page)
    assert parsed.recognized and [i.id for i in parsed.items] == [11, 12]
    assert parsed.items[0].ts is not None


def test_microdata_garbage_is_not_recognized():
    assert al.parse_page("<html>Доступ ограничен: проблема с IP</html>").recognized is False


def test_block_marker_case_insensitive(tmp_path):
    store, watcher, fetcher, got, url, wid = _setup(tmp_path)
    fetcher.pages = ["<html>Доступ ограничен: проблема с IP</html>".lower()]

    async def go():
        with pytest.raises(al.Blocked):
            await watcher.poll_url(url, store.active_by_url()[url])

    asyncio.run(go())


def test_sync_criteria_add_update_remove(tmp_path):
    store = al.Store(str(tmp_path / "t.db"))
    u1 = al.normalize_url("https://www.avito.ru/moskva/odezhda?q=a")
    u2 = al.normalize_url("https://www.avito.ru/moskva/odezhda?q=b")
    manual = store.add_watch(9, u1)                      # ручное /watch
    assert store.sync_criteria({(1, u1): (10, 60), (1, u2): (11, 300)}) == (2, 0)
    assert {w.crit_id for ws in store.active_by_url().values() for w in ws if w.user_id == 1} == {10, 11}
    # повтор ничего не меняет
    assert store.sync_criteria({(1, u1): (10, 60), (1, u2): (11, 300)}) == (0, 0)
    # смена периода (тариф) и удаление поиска 11
    assert store.sync_criteria({(1, u1): (10, 300)}) == (0, 1)
    w10 = [w for w in store.user_watches(1)]
    assert len(w10) == 1 and w10[0].interval == 300
    # ручное слежение другого пользователя не тронуто и не видно как «поиск бота»
    assert [w.id for w in store.user_watches(9, manual_only=True)] == [manual]
    assert store.remove_watch(w10[0].id, 1, manual_only=True) is False   # поиск бота через /unwatch не убрать


def test_sync_adopts_existing_manual_watch(tmp_path):
    store = al.Store(str(tmp_path / "t.db"))
    u = al.normalize_url("https://www.avito.ru/moskva/odezhda?q=a")
    wid = store.add_watch(1, u)
    assert store.sync_criteria({(1, u): (5, 120)}) == (0, 0)
    w = store.user_watches(1)[0]
    assert w.id == wid and w.crit_id == 5 and w.interval == 120


def test_item_filter_marks_seen_but_not_sent(tmp_path):
    store = al.Store(str(tmp_path / "t.db"))
    got = []

    async def sink(w, it):
        got.append(it.id)

    fetcher = FakeFetcher()
    fetcher.pages = [make_page([item(1)]),
                     make_page([item(2, price=900, age=1), item(3, price=50000, age=2), item(1)])]
    watcher = al.LiveWatcher(store, fetcher, sink, item_filter=lambda w, it: it.price <= 10000)
    url = al.normalize_url("https://www.avito.ru/moskva/odezhda?q=a")
    store.add_watch(1, url)

    async def go():
        await watcher.poll_url(url, store.active_by_url()[url])
        await watcher.poll_url(url, store.active_by_url()[url])
        await watcher.poll_url(url, store.active_by_url()[url])

    asyncio.run(go())
    assert got == [2]      # дорогой (3) отсеян и повторно не придёт


if __name__ == "__main__":
    import inspect
    import pathlib
    import tempfile
    import traceback
    bad = 0
    for _n, _f in list(globals().items()):
        if _n.startswith("test_") and callable(_f):
            try:
                if "tmp_path" in inspect.signature(_f).parameters:
                    _f(pathlib.Path(tempfile.mkdtemp()))
                else:
                    _f()
                print("  ✓", _n)
            except Exception:
                bad += 1
                print("  ✗", _n)
                traceback.print_exc()
    print("\navito_live: все проверки прошли" if not bad else f"\nпровалено: {bad}")
    sys.exit(1 if bad else 0)
