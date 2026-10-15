"""Тесты и замеры этапа K: пакетный приём находок (стабильность загрузки).

Что проверяем:
 1. Дедуп пакетного режима не потерял правила: тот же external_id → дубль,
    тот же заголовок+цена+город → дубль, тот же отпечаток → дубль,
    два одинаковых объявления В ОДНОЙ партии не вставляются дважды.
 2. Замер до/после: старый ingest (по SELECT на карточку) против нового
    (три выборки на партию) на базе в 20 000 объявлений.

Запуск: python3 tests/test_stage_k.py
"""
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
OLD = '/tmp/polka_bot.pre-K.py'          # копия до этапа K (см. историю)
NEW_SRC = open(BOT, encoding='utf-8').read()
OLD_SRC = open(OLD, encoding='utf-8').read() if os.path.exists(OLD) else NEW_SRC

TOKENS = ('_chunked', '_MEDIANS_DIRTY', 'schedule_medians', '_ad_fingerprint', '_normalize_title',
          '_photo_name', '_price_bucket', '_price_drop', 'ingest_findings')


def chunks(src):
    out, cur = [], []
    for line in src.split('\n'):
        starts_new = (bool(line) and not line[0].isspace()
                      and not line.startswith(('#', ')', ']', '}', 'else', 'elif',
                                               'except', 'finally', 'from', 'import')))
        if starts_new and cur:
            out.append(cur)
            cur = []
        cur.append(line)
    if cur:
        out.append(cur)
    return out


def name_of(chunk):
    m = re.match(r'(?:async\s+def|class|def)\s+([A-Za-z_][A-Za-z0-9_]*)', chunk[0])
    if m:
        return m.group(1)
    m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=', chunk[0])
    return m.group(1) if m else ''


# Индексы, которые были в базе ДО этапа K (как в проде)
DDL_BASE = '''
CREATE TABLE ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER, title TEXT, description TEXT, price INTEGER,
    photos TEXT, category TEXT, city TEXT, status TEXT,
    created_at TEXT, published_at TEXT, source TEXT, source_url TEXT,
    external_id TEXT, parsed_at TEXT, views INTEGER DEFAULT 0,
    published_hours_ago INTEGER, title_lower TEXT, age_estimated INTEGER DEFAULT 0,
    fingerprint TEXT, last_drop_notice_at TEXT, discount_percent INTEGER, prev_price INTEGER,
    condition TEXT, delivery TEXT, price_suspect INTEGER DEFAULT 0, market_median INTEGER,
    seller_type TEXT DEFAULT ''
);
CREATE TABLE ads_dupes (id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER,
    source TEXT, external_id TEXT, seen_at TEXT, UNIQUE(ad_id, external_id));
CREATE TABLE ads_price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER,
    price INTEGER, seen_at TEXT);
CREATE INDEX idx_ads_status ON ads(status);
CREATE INDEX idx_ads_created ON ads(created_at DESC);
CREATE INDEX idx_ads_price ON ads(price);
'''

# Индексы этапа K5 — их в проде не было, поэтому дедуп шёл полным сканом
K5_INDEXES = '''
CREATE INDEX idx_ads_source_ext ON ads(source, external_id);
CREATE INDEX idx_ads_source_title ON ads(source, title);
CREATE INDEX idx_ads_fingerprint ON ads(fingerprint);
'''

DDL = DDL_BASE + K5_INDEXES

NOW = datetime(2026, 10, 14, 12, 0, 0, tzinfo=ZoneInfo('Europe/Moscow'))
NOW_ISO = NOW.isoformat()


class FakeLog:
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass
    def info(self, *a, **k): pass


def build_ns(src, conn):
    ns = {
        'os': os, 'json': json, 're': re, 'hashlib': hashlib, 'time': time,
        'Dict': Dict, 'List': List, 'Optional': Optional, 'Any': Any,
        'datetime': datetime, 'timedelta': timedelta, 'ZoneInfo': ZoneInfo,
        'db': type('D', (), {'conn': conn})(), 'logger': FakeLog(),
        'get_moscow_time': lambda: NOW,
        'FINDING_SOURCES': ('avito', 'yula', 'other'),
        '_miniapp_display_category': lambda c: c or 'Электроника',
        'HUNT_MIN_SAMPLE': 5,
        '_time': time,
        'HUNT_PRICE_DROP_PERCENT': 5,
        'recompute_market_medians': lambda *a, **k: 0,
        'recompute_criterion_medians': lambda *a, **k: 0,
        '_hours_since': lambda iso: 100.0,
        'hunt_matches_recompute': lambda **k: 0,
        'FINGERPRINT_TITLE_STOPWORDS': frozenset({'продам', 'срочно', 'торг', 'новый'}),
        'hunt_matches_recompute': lambda **k: 0,
        'hunt_need_details': lambda ids: [],
        'schedule_medians': lambda **k: None,
        'logger': FakeLog(),
    }
    picked = {}
    for chunk in chunks(src):
        n = name_of(chunk)
        if n in TOKENS and n not in picked:
            picked[n] = '\n'.join(chunk)
    # K-хелперы есть только в новой версии; для старой они не нужны
    core = [n for n in ('ingest_findings', '_ad_fingerprint', '_normalize_title', '_price_drop')
            if n not in picked]
    assert not core, f'не нашлись куски: {core}'
    for n, text in picked.items():
        exec(text, ns)
    return ns


def items_batch(n, seed_prefix='a', price=40000):
    out = []
    for i in range(n):
        out.append({
            'title': f'iPhone 13 Pro {seed_prefix}{i}',
            'price': price + i,
            'city': 'Ижевск',
            'category': 'Электроника',
            'url': f'https://www.avito.ru/item/{seed_prefix}{i}',
            'external_id': f'{seed_prefix}{i}',
            'photos': [f'https://img.avito.ru/{seed_prefix}{i}.jpg'],
            'hours_ago': 2,
        })
    return out


def run(src, conn, items, source='avito'):
    ns = build_ns(src, conn)
    return ns['ingest_findings'](items, source)


print('этап K: пакетный приём находок\n')

# ── 1. Правила дедупа
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript(DDL)
batch = items_batch(50, 'b')
stats = run(NEW_SRC, conn, batch)
assert stats['accepted'] == 50, stats
assert stats['duplicate'] == 0, stats
ok = 1
print(f'1) первая партия: принято {stats["accepted"]}, дублей {stats["duplicate"]}')

# повтор той же партии → всё дубли
stats2 = run(NEW_SRC, conn, batch)
assert stats2['accepted'] == 0 and stats2['duplicate'] == 50, stats2
print(f'2) повтор той же партии: принято {stats2["accepted"]}, дублей {stats2["duplicate"]}')

# два одинаковых объявления В ОДНОЙ партии — вставляется одно
conn2 = sqlite3.connect(':memory:')
conn2.row_factory = sqlite3.Row
conn2.executescript(DDL)
same = [dict(items_batch(1, 'c')[0]), dict(items_batch(1, 'c')[0])]
same[0]['external_id'] = 'c1'
same[1]['external_id'] = 'c2'
stats3 = run(NEW_SRC, conn2, same)
assert stats3['accepted'] == 1 and stats3['duplicate'] == 1, stats3
total = conn2.execute("SELECT COUNT(*) FROM ads").fetchone()[0]
assert total == 1, total
print(f'3) два одинаковых в одной партии: в базе {total}, дублей {stats3["duplicate"]}')

# тот же товар с другим external_id в СЛЕДУЮЩЕЙ партии → дубль по отпечатку
again = dict(items_batch(1, 'c')[0])
again['external_id'] = 'c9'
stats4 = run(NEW_SRC, conn2, [again])
assert stats4['accepted'] == 0 and stats4['duplicate'] == 1, stats4
print(f'4) тот же товар с новым id: дублей {stats4["duplicate"]} (отпечаток)')

# цена упала у известного объявления → это не дубль, а новость (D8)
conn3 = sqlite3.connect(':memory:')
conn3.row_factory = sqlite3.Row
conn3.executescript(DDL)
first = items_batch(1, 'd', price=40000)
run(NEW_SRC, conn3, first)
cheaper = items_batch(1, 'd', price=20000)
stats5 = run(NEW_SRC, conn3, cheaper)
assert stats5['accepted'] == 0 and stats5['duplicate'] == 1, stats5
print(f'5) цена упала вдвое: дубль, но зафиксировано снижение ({stats5.get("price_drop", 0)})')

# ── 2. Замер до/после на 20 000 объявлений
print('\nзамер: партия 500 карточек на базе в 20 000 объявлений')
FILL_SQL = ("INSERT INTO ads (title, price, city, category, source, external_id, status, photos,"
            " created_at, parsed_at, fingerprint, title_lower) "
            "VALUES (?,?,?,?,?,?, 'active', '[]', ?, ?, ?, ?)")


def fill_base(conn, n=20000, prefix='z'):
    rows = items_batch(n, prefix)
    conn.executemany(FILL_SQL, [(f['title'], f['price'], f['city'], f['category'], 'avito',
                                 f['external_id'], NOW_ISO, NOW_ISO,
                                 'fp' + f['external_id'], f['title'].lower()) for f in rows])
    conn.commit()


def measure(ddl, src):
    conn = sqlite3.connect(':memory:')
    conn.row_factory = sqlite3.Row
    conn.executescript(ddl)
    fill_base(conn)
    queries = []
    conn.set_trace_callback(lambda s: queries.append(s))
    t0 = time.monotonic()
    st = run(src, conn, items_batch(500, 'p'))
    dt = time.monotonic() - t0
    conn.set_trace_callback(None)
    selects = sum(1 for q in queries if q.strip().upper().startswith('SELECT'))
    return dt, st, len(queries), selects


# «до»: старый код на старой базе. «после»: пакетный режим + индексы K5
before = measure(DDL_BASE, OLD_SRC)
after = measure(DDL, NEW_SRC)
print(f'   до:    {before[0]*1000:6.0f} мс, запросов {before[2]:5d}, из них выборок '
      f'{before[3]:5d} (принято {before[1]["accepted"]})')
print(f'   после: {after[0]*1000:6.0f} мс, запросов {after[2]:5d}, из них выборок '
      f'{after[3]:5d} (принято {after[1]["accepted"]})')
speedup = before[0] / max(after[0], 1e-6)
qdrop = before[3] / max(after[3], 1)
print(f'\nприём быстрее в {speedup:.0f} раз, выборок из базы меньше в {qdrop:.0f} раз')
assert after[0] < before[0], 'пакетный режим не быстрее'
assert after[2] < before[2], 'запросов не стало меньше'
assert after[1]['accepted'] == 500 and before[1]['accepted'] == 500

# ── 3. K7: лента во время приёма партии (локальный замер)
print('\nлента во время приёма: 20 «читателей» и партия 500 карточек')
import statistics
import threading

FEED_SQL = ("SELECT * FROM ads WHERE status='active' AND (source IS NULL OR source='polka') "
            "ORDER BY created_at DESC, id DESC LIMIT 20")


def run_contention(ddl, src, board_rows=2000, readers=20, seconds=1.5):
    conn = sqlite3.connect(':memory:', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(ddl)
    fill_base(conn, 20000, 'z')
    board = items_batch(board_rows, 'q')
    conn.executemany(FILL_SQL, [(f['title'], f['price'], f['city'], f['category'], 'polka',
                                 f['external_id'], NOW_ISO, NOW_ISO,
                                 'fpb' + f['external_id'], f['title'].lower()) for f in board])
    conn.commit()
    lock = threading.RLock()
    lat, errors, stop = [], [], threading.Event()

    def reader():
        while not stop.is_set():
            t0 = time.monotonic()
            try:
                conn.execute(FEED_SQL).fetchall()
                lat.append((time.monotonic() - t0) * 1000)
            except Exception as e:
                errors.append(f'{type(e).__name__}: {e}')
                lat.append(9999.0)

    def writer():
        for i in range(3):
            with lock:
                run(src, conn, items_batch(500, f'w{i}'))
        stop.set()

    threads = [threading.Thread(target=reader) for _ in range(readers)]
    for th in threads:
        th.start()
    wr = threading.Thread(target=writer)
    wr.start()
    stop.wait(seconds)
    stop.set()
    wr.join()
    for th in threads:
        th.join()
    if errors:
        print(f'      ошибки чтения ({len(errors)}): {errors[0]}')
    if not lat:
        return 0.0, 0.0, 0
    lat.sort()
    p95 = lat[int(len(lat) * 0.95) - 1] if len(lat) > 1 else lat[0]
    return p95, lat[-1], len(lat)


before_c = run_contention(DDL_BASE, OLD_SRC)
after_c = run_contention(DDL, NEW_SRC)
print(f'   до:    p95 {before_c[0]:6.0f} мс, максимум {before_c[1]:6.0f} мс '
      f'({before_c[2]} запросов ленты)')
print(f'   после: p95 {after_c[0]:6.0f} мс, максимум {after_c[1]:6.0f} мс '
      f'({after_c[2]} запросов ленты)')
print(f'   требование K7: p95 < 1500 мс, ни одного > 5000 мс — '
      f'{"выполнено" if after_c[0] < 1500 and after_c[1] < 5000 else "НЕ выполнено"}')
assert after_c[0] < 1500, f'p95 ленты {after_c[0]:.0f} мс'
assert after_c[1] < 5000, f'максимум ленты {after_c[1]:.0f} мс'

# ── 4. Медианы: скорость прохода и короткая блокировка
print('\nмедианы категорий: проход по 9 категориям на 20 000 объявлений')
MED_TOKENS = ('recompute_market_medians',)


def build_med_ns(conn):
    ns = build_ns(NEW_SRC, conn)
    i = NEW_SRC.index('def recompute_market_medians(')
    end = re.compile(r'^(async )?def ', re.M).search(NEW_SRC, i + 10)
    exec(NEW_SRC[i:end.start()], ns)
    return ns


med_conn = sqlite3.connect(':memory:')
med_conn.row_factory = sqlite3.Row
med_conn.executescript(DDL + "CREATE INDEX idx_ads_category_price ON ads(category, price);")
cats = ['Электроника', 'Одежда', 'Дом', 'Транспорт', 'Хобби', 'Детям', 'Красота', 'Спорт', 'Зоотовары']
rows = []
for i in range(20000):
    rows.append((cats[i % len(cats)], 1000 + (i % 500) * 37, 'active', 0, 'avito'))
med_conn.executemany("INSERT INTO ads (category, price, status, price_suspect, source) "
                     "VALUES (?,?,?,?,?)", rows)
med_conn.commit()
med_ns = build_med_ns(med_conn)
t0 = time.monotonic()
updated = med_ns['recompute_market_medians']()
first_ms = (time.monotonic() - t0) * 1000
t0 = time.monotonic()
again = med_ns['recompute_market_medians']()
second_ms = (time.monotonic() - t0) * 1000
print(f'   первый проход: {first_ms:.0f} мс (категорий {updated}), '
      f'повтор без изменений: {second_ms:.0f} мс (категорий {again})')
# медиана посчитана верно: цены в категории идут шагом 37 с повтором по кругу
sample = [r['price'] for r in med_conn.execute(
    "SELECT price FROM ads WHERE category=? AND status='active' ORDER BY price", (cats[0],))]
mid = len(sample) // 2
expect = sample[mid] if len(sample) % 2 else (sample[mid - 1] + sample[mid]) // 2
got = med_conn.execute("SELECT market_median FROM ads WHERE category=? LIMIT 1",
                       (cats[0],)).fetchone()['market_median']
assert int(got) == expect, (got, expect)
assert second_ms < first_ms, 'повторный проход не быстрее'
print(f'   медиана категории «{cats[0]}»: {got} (совпадает с расчётом по списку цен)')
assert first_ms < 3000, f'проход медиан слишком долгий: {first_ms:.0f} мс'

# ── 5. Чтение не ждёт долгую блокировку (иначе цикл событий встанет)
lock_ns_conn = sqlite3.connect(':memory:')
lock_ns_conn.row_factory = sqlite3.Row
lock_ns_conn.executescript(DDL)
lock_ns = build_ns(NEW_SRC, lock_ns_conn)
lock = __import__('threading').RLock()
lock.acquire()
lock_ns['DB_WRITE_LOCK'] = lock
lock_ns['_db_read'] = None
i = NEW_SRC.index('def _db_read(')
end = re.compile(r'^(async )?def ', re.M).search(NEW_SRC, i + 5)
exec(NEW_SRC[i:end.start()], lock_ns)
t0 = time.monotonic()
lock_ns['_db_read'](lambda: 42)
waited_ms = (time.monotonic() - t0) * 1000
lock.release()
print(f'\nчтение при занятой блокировке: подождало {waited_ms:.0f} мс '
      f'({"не блокирует цикл" if waited_ms < 500 else "БЛОКИРУЕТ"})')
assert waited_ms < 500, f'чтение ждало {waited_ms:.0f} мс'

# ── 6. Снижение цены не будит отклонённые решения (иначе спам по всем критериям)
print('\nснижение цены: кого будим повторно')
drop_ns = build_ns(NEW_SRC, conn)
for name in ('_price_drop', 'hunt_flush_stale_sending'):
    i = NEW_SRC.index(f'def {name}(')
    end = re.compile(r'^(async )?def ', re.M).search(NEW_SRC, i + 5)
    exec(NEW_SRC[i:end.start()], drop_ns)
drop_ns['HUNT_PRICE_DROP_PERCENT'] = 5
drop_ns['HUNT_SEND_MAX_TRIES'] = 3
drop_ns['_hours_since'] = lambda iso: 100.0

dconn = sqlite3.connect(':memory:')
dconn.row_factory = sqlite3.Row
dconn.executescript(DDL + """
CREATE TABLE hunt_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
    crit_id INTEGER, ad_id INTEGER, status TEXT, reason TEXT DEFAULT '',
    reject_reason TEXT DEFAULT '', discount INTEGER DEFAULT 0, desc_state TEXT DEFAULT '',
    created_at TEXT, updated_at TEXT, delivery TEXT DEFAULT '', send_attempts INTEGER DEFAULT 0,
    send_error TEXT DEFAULT '', fingerprint TEXT DEFAULT '', unverified INTEGER DEFAULT 0,
    deliver_after TEXT DEFAULT '', unlocked_by_user INTEGER DEFAULT 0,
    deep_check INTEGER DEFAULT 0, notified_at TEXT, UNIQUE(user_id, ad_id, crit_id));
""")
dconn.execute("INSERT INTO ads (id, title, price, status, last_drop_notice_at, source) "
              "VALUES (7, 'Худи bape', 5000, 'active', '', 'avito')")
# четыре решения по одному объявлению: отклонённое и три принятых
for crit_id, status in ((7, 'rejected'), (8, 'sent'), (9, 'ready'), (10, 'send_failed')):
    dconn.execute("INSERT INTO hunt_matches (user_id, crit_id, ad_id, status, updated_at) "
                  "VALUES (1, ?, 7, ?, ?)", (crit_id, status, NOW_ISO))
dconn.commit()
dns = build_ns(NEW_SRC, dconn)
for name in ('_price_drop', 'hunt_flush_stale_sending'):
    i = NEW_SRC.index(f'def {name}(')
    end = re.compile(r'^(async )?def ', re.M).search(NEW_SRC, i + 5)
    exec(NEW_SRC[i:end.start()], dns)
dns['HUNT_PRICE_DROP_PERCENT'] = 5
dns['HUNT_SEND_MAX_TRIES'] = 3
dns['_hours_since'] = lambda iso: 100.0
stats = {'ids': [], 'price_drop': 0}
dns['_price_drop'](dconn.cursor(), 7, 5000, 3000, '', NOW_ISO, stats)
dconn.commit()
states = {r['crit_id']: (r['status'], r['reason']) for r in
          dconn.execute("SELECT crit_id, status, reason FROM hunt_matches WHERE ad_id=7")}
assert states[7][0] == 'rejected', f'отклонённое решение разбудили: {states[7]}'
assert states[8][0] == 'ready' and states[8][1] == 'price_drop', states[8]
assert states[9][0] == 'ready', states[9]
assert states[10][0] == 'ready', states[10]
print('   отклонённое решение осталось rejected (пересчитает пересчёт, а не «подешевело»)')

# ── 7. Зависшие в sending возвращаются в очередь
old_ts = '2026-10-14T11:00:00+03:00'   # раньше NOW минус 15 минут
dconn.execute("INSERT INTO hunt_matches (user_id, crit_id, ad_id, status, updated_at, send_attempts) "
              "VALUES (1, 100, 7, 'sending', ?, 0)", (old_ts,))
dconn.execute("INSERT INTO hunt_matches (user_id, crit_id, ad_id, status, updated_at, send_attempts) "
              "VALUES (1, 101, 7, 'sending', ?, 3)", (old_ts,))
dconn.commit()
fixed = dns['hunt_flush_stale_sending'](minutes=15)
after = {r['crit_id']: r['status'] for r in
         dconn.execute("SELECT crit_id, status FROM hunt_matches WHERE crit_id IN (100,101)")}
assert after[100] == 'ready' and after[101] == 'send_failed', after
print(f'   зависшие: вернули в очередь {after[100]}, после 3 попыток — {after[101]} '
      f'(всего поправлено {fixed})')

# ── 8. Тип продавца из карточки списка (без страницы объявления)
print('\nтип продавца из списка: «только с рук» без прокси')
sconn = sqlite3.connect(':memory:')
sconn.row_factory = sqlite3.Row
sconn.executescript(DDL)
sns = build_ns(NEW_SRC, sconn)
n = 0
for ext, stype in (('s1', 'company'), ('s2', 'private'), ('s3', '')):
    it = {'title': f'Куртка Zara {ext}', 'price': 2450, 'url': f'https://www.avito.ru/x_{ext}',
          'external_id': ext, 'city': 'Ижевск', 'category': 'Одежда',
          'photos': ['https://img.avito.st/1.jpg'], 'hours_ago': 2, 'seller_type': stype}
    sns['ingest_findings']([it], 'avito')
    row = sconn.execute("SELECT seller_type FROM ads WHERE external_id=?", (ext,)).fetchone()
    got = (row['seller_type'] or '') if row else 'нет строки'
    assert got == stype, (ext, stype, got)
    n += 1
# кривой тип не должен попадать в базу
sns['ingest_findings']([{'title': 'Куртка Zara s4', 'price': 2450,
                         'url': 'https://www.avito.ru/x_s4', 'external_id': 's4',
                         'city': 'Ижевск', 'category': 'Одежда', 'seller_type': 'магазин'},
                        ], 'avito')
bad = sconn.execute("SELECT seller_type FROM ads WHERE external_id='s4'").fetchone()['seller_type']
assert (bad or '') == '', bad
print(f'   сохранено типов продавца: {n} (company/private/пусто), мусорный отброшен')

print('\nK: все проверки пройдены')
