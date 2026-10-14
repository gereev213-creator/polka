"""Тесты этапа E: отпечаток объявления и дедупликация.

Запуск: python3 tests/test_fingerprint.py
"""
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional, NamedTuple
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('Decision', 'FINGERPRINT_TITLE_STOPWORDS', '_normalize_title', '_photo_name',
          '_price_bucket', '_ad_fingerprint', 'FINDING_SOURCES', 'HUNT_PRICE_DROP_PERCENT',
          'ingest_findings', '_price_drop', '_miniapp_display_category', '_hours_since',
          '_safe_isoparse', 'ensure_quality_columns', 'ensure_fingerprint_backfill',
          'ensure_hunt_matches', 'dedupe_existing', 'hunt_match_store',
          '_chunked', '_MEDIANS_DIRTY', 'schedule_medians')


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


NOW = datetime(2026, 10, 14, 12, 0, 0, tzinfo=ZoneInfo('Europe/Moscow'))
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
    CREATE TABLE ads (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, title_lower TEXT,
        description TEXT, price INTEGER, photos TEXT, category TEXT, city TEXT, status TEXT,
        created_at TEXT, published_at TEXT, source TEXT, source_url TEXT, external_id TEXT,
        parsed_at TEXT, views INTEGER, published_hours_ago INTEGER, age_estimated INTEGER DEFAULT 0,
        price_suspect INTEGER DEFAULT 0, prev_price INTEGER DEFAULT 0, last_drop_notice_at TEXT,
        market_median INTEGER, discount_percent INTEGER);
    CREATE TABLE ads_price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER,
        price INTEGER, seen_at TEXT);
    CREATE TABLE hunt_criteria (id INTEGER PRIMARY KEY, user_id INTEGER, query TEXT);
    CREATE TABLE search_notifications_sent (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
        ad_id INTEGER, sent_at TEXT, UNIQUE(user_id, ad_id));
    CREATE TABLE hunt_hidden (user_id INTEGER, ad_id INTEGER, created_at TEXT,
        UNIQUE(user_id, ad_id));
    CREATE TABLE favorites (user_id INTEGER, ad_id INTEGER, added_at TEXT);
''')


class FakeLog:
    def error(self, *a, **k):
        pass

    def warning(self, *a, **k):
        pass

    def info(self, *a, **k):
        pass

    def debug(self, *a, **k):
        pass


class FakeDb:
    def __init__(self, c):
        self.conn = c

    def is_search_notification_sent(self, u, a):
        return False

    def mark_search_notification_sent(self, u, a):
        pass


ns = {'os': os, 're': re, 'json': json, 'hashlib': hashlib, 'sqlite3': sqlite3,
      'NamedTuple': NamedTuple, 'Dict': Dict, 'List': List, 'Optional': Optional,
      'Tuple': tuple, 'Any': object, 'datetime': datetime, 'timedelta': timedelta,
      'ZoneInfo': ZoneInfo, 'logger': FakeLog(), 'db': FakeDb(conn), '_time': __import__('time'),
      'get_moscow_time': lambda: NOW,
      # заглушки: пересчёт и очереди тестируются отдельно
      'recompute_market_medians': lambda *a, **k: 0,
      'recompute_criterion_medians': lambda *a, **k: 0,
      'hunt_matches_recompute': lambda *a, **k: 0,
      'hunt_need_details': lambda *a, **k: []}

picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS:
        picked.append((n, '\n'.join(chunk)))
found = {n for n, _ in picked}
missing = [n for n in TOKENS if n not in found]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

fp = ns['_ad_fingerprint']
norm = ns['_normalize_title']
bucket = ns['_price_bucket']
ingest = ns['ingest_findings']
dedupe = ns['dedupe_existing']
store = ns['hunt_match_store']
Decision = ns['Decision']

ns['ensure_quality_columns']()
ns['ensure_hunt_matches']()

# ── 1. Нормализация заголовка и ведро цены
assert norm('iPhone 14 Pro, НОВЫЙ! срочно') == 'iphone 14 pro', norm('iPhone 14 Pro, НОВЫЙ! срочно')
assert norm('iPhone 14 Pro') == norm('  iPHONE 14 pro !!! торг  ')
assert bucket(10000) == bucket(9500), (bucket(10000), bucket(9500))
assert bucket(10000) != bucket(12000), (bucket(10000), bucket(12000))
assert bucket(53) == 53
print('1) нормализация заголовка и ведро цены: 10 000 ≈ 9 500, 10 000 ≠ 12 000')

# ── 2. Отпечаток не зависит от регистра/знаков/параметров фото
p = ['https://img.avito.st/20/image/1.jpg?x=1', 'https://img.avito.st/other/2.jpg']
a = fp('iPhone 14 Pro 128', 50000, p)
b = fp('  iPHONE 14 pro 128 !! торг ', 50500, ['https://img.avito.st/20/image/1.jpg'])
c = fp('iPhone 14 Pro 128', 50000, ['https://img.avito.st/20/image/2.jpg'])
assert a == b, (a, b)
assert a != c, (a, c)
print('2) отпечаток: регистр/знаки/параметры URL не меняют его, другое фото — меняет')

# ── 3. ingest: то же объявление с разными external_id / городом / источником → одна строка
def item(**kw):
    base = {'title': 'iPhone 14 Pro 128', 'price': 50000, 'url': 'https://www.avito.ru/x_1',
            'external_id': '111', 'city': '', 'category': 'Электроника',
            'photos': ['https://img.avito.st/1.jpg']}
    base.update(kw)
    return base

r1 = ingest([item()], 'avito')
r2 = ingest([item(external_id='222', url='https://www.avito.ru/x_2')], 'avito')
r3 = ingest([item(external_id='333', city='Москва', url='https://www.avito.ru/x_3')], 'avito')
r4 = ingest([item(external_id='444', url='https://www.avito.ru/x_4')], 'yula')
rows = conn.execute("SELECT * FROM ads").fetchall()
assert len(rows) == 1, [dict(r) for r in rows]
assert rows[0]['external_id'] == '111', dict(rows[0])
dupes = conn.execute("SELECT COUNT(*) AS n FROM ads_dupes").fetchone()['n']
assert dupes == 3, dupes
assert r2['duplicate'] == 1 and r3['duplicate'] == 1 and r4['duplicate'] == 1, (r2, r3, r4)
print('3) ingest: 4 приёма одного лота (разные ext/город/источник) → 1 строка в ads, 3 записи в ads_dupes')

# ── 4. ingest: действительно разные лоты не склеиваются
conn.execute("DELETE FROM ads"); conn.execute("DELETE FROM ads_dupes"); conn.commit()
ingest([item(title='iPhone 14 Pro 128'), item(title='iPhone 14 Pro 256', external_id='555',
       url='https://www.avito.ru/x_5', photos=['https://img.avito.st/256.jpg'])], 'avito')
assert conn.execute("SELECT COUNT(*) AS n FROM ads").fetchone()['n'] == 2
print('4) разные лоты (память, фото) — две строки')

# ── 5. hunt_match_store: дубль по отпечатку становится rejected/duplicate
conn.execute("DELETE FROM ads"); conn.execute("DELETE FROM hunt_matches"); conn.commit()
_ph1 = json.dumps(['https://i/1.jpg'])
conn.execute("INSERT INTO ads (id, title, price, photos, status, fingerprint, parsed_at, source) "
             "VALUES (1, 'iPhone 14 Pro', 50000, ?, 'active', 'FP1', ?, 'avito')",
             (_ph1, NOW.isoformat()))
conn.execute("INSERT INTO ads (id, title, price, photos, status, fingerprint, parsed_at, source) "
             "VALUES (2, 'iPhone 14 Pro', 50000, ?, 'active', 'FP1', ?, 'avito')",
             (_ph1, NOW.isoformat()))
conn.commit()
okd = Decision(True, 'ok_discount', '', 20, False)
store(7, 10, 1, okd, desc_state='ok', fingerprint='FP1')
store(7, 10, 2, okd, desc_state='ok', fingerprint='FP1')
rows = {r['ad_id']: dict(r) for r in conn.execute("SELECT * FROM hunt_matches").fetchall()}
assert rows[1]['status'] == 'ready', rows[1]
assert rows[2]['status'] == 'rejected' and rows[2]['reject_reason'] == 'duplicate', rows[2]
print('5) hunt_matches: второй лот с тем же отпечатком → rejected/duplicate')

# ── 6. dedupe_existing: отчёт и применение
conn.execute("DELETE FROM hunt_matches"); conn.commit()
conn.execute("UPDATE ads SET status='active' WHERE id IN (1,2)")
conn.execute("INSERT INTO search_notifications_sent (user_id, ad_id, sent_at) VALUES (7, 2, ?)",
             (NOW.isoformat(),))
conn.commit()
rep = dedupe(dry_run=True)
assert rep['groups'] >= 1 and rep['marked'] >= 1 and rep['dry_run'] is True, rep
assert conn.execute("SELECT COUNT(*) AS n FROM ads WHERE status='duplicate'").fetchone()['n'] == 0
rep2 = dedupe(dry_run=False)
assert rep2['marked'] >= 1, rep2
assert conn.execute("SELECT COUNT(*) AS n FROM ads WHERE status='duplicate'").fetchone()['n'] >= 1
moved = conn.execute("SELECT ad_id FROM search_notifications_sent WHERE user_id=7").fetchone()['ad_id']
assert moved == 1, moved  # отметка переехала на оставленную строку
print('6) dedupe_existing: dry-run только отчёт, go — помечает duplicate и переносит отметки')

print('\nE: все проверки пройдены')
