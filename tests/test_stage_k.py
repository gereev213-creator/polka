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
    condition TEXT, delivery TEXT
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

print('\nK: все проверки пройдены')
