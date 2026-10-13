"""Тесты этапов D3 (подозрительные цены), D5 (оценка возраста), D8 (снижение цены).

Запуск: python3 tests/test_quality.py
"""
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, List, Optional, NamedTuple

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'evaluate_ad', '_condition_ok', '_query_alt_numbers', '_query_words_required',
          'query_word_variants', '_query_word_variants_orig', '_requirement_excludes',
          'HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START', 'HUNT_CONDITION_WORDS',
          'HUNT_NEGATION_WORDS', 'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_RE_JUNK_ANYWHERE',
          'HUNT_RE_JUNK_START', 'HUNT_RE_CONDITION', 'HUNT_RE_NEGATION', 'HUNT_RE_SHOP',
          'HUNT_RE_SHOP_MATCH', '_hunt_word_pattern', '_hunt_asked_stems',
          '_hunt_marker_asked', 'hunt_junk_word', 'hunt_junk_start_word',
          'hunt_condition_word', 'hunt_shop_in_name',
          '_ad_hours_ago', 'HUNT_SUSPECT_DISCOUNT', 'HUNT_PRICE_DROP_PERCENT',
          '_hours_since', '_price_drop', '_safe_isoparse',
          'HUNT_ACCESSORY_WORDS', 'HUNT_REPLICA_MARKERS', 'HUNT_SHOP_MARKERS',
          'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS', 'HUNT_STOP_WORDS', 'QUERY_SYNONYMS',
          'QUALIFIER_RU', 'HUNT_MODEL_QUALIFIERS', 'HUNT_TITLE_START_JUNK',
          'HUNT_FRESH_HOURS', 'HUNT_ALLOW_UNDATED', 'HUNT_MIN_PRICE_SHARE')


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
    m = re.match(r'(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)', chunk[0])
    if m:
        return m.group(1)
    m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=', chunk[0])
    return m.group(1) if m else ''


NOW = datetime(2026, 10, 13, 12, 0, 0, tzinfo=ZoneInfo('Europe/Moscow'))
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
    CREATE TABLE ads (id INTEGER PRIMARY KEY, title TEXT, title_lower TEXT, price INTEGER,
                      city TEXT, category TEXT, description TEXT, photos TEXT,
                      published_hours_ago INTEGER, age_estimated INTEGER DEFAULT 0,
                      parsed_at TEXT, created_at TEXT, seller_type TEXT, status TEXT,
                      price_suspect INTEGER DEFAULT 0, prev_price INTEGER DEFAULT 0,
                      last_drop_notice_at TEXT, market_median INTEGER, discount_percent INTEGER);
    CREATE TABLE ads_price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER,
                                    price INTEGER, seen_at TEXT);
    CREATE TABLE hunt_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
                               crit_id INTEGER, ad_id INTEGER, status TEXT, reason TEXT,
                               reject_reason TEXT, discount INTEGER, desc_state TEXT,
                               created_at TEXT, updated_at TEXT, delivery TEXT,
                               send_attempts INTEGER, send_error TEXT, notified_at TEXT,
                               UNIQUE(user_id, ad_id));
''')

ns = {'os': os, 're': re, 'sqlite3': sqlite3, 'NamedTuple': NamedTuple, 'Dict': Dict,
      'List': List, 'Optional': Optional, 'Tuple': tuple,
      'logger': type('L', (), {'warning': staticmethod(lambda *a, **k: None),
                               'info': staticmethod(lambda *a, **k: None),
                               'error': staticmethod(lambda *a, **k: None)})(),
      'db': type('D', (), {'conn': conn})(),
      'get_moscow_time': lambda: NOW,
      'timedelta': timedelta, 'datetime': datetime, 'ZoneInfo': ZoneInfo}
picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS:
        picked.append((n, '\n'.join(chunk)))
found = {n for n, _ in picked}
missing = [n for n in set(TOKENS) if n not in found]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

evaluate = ns['evaluate_ad']
hours_ago = ns['_ad_hours_ago']
price_drop = ns['_price_drop']


def ad(**kw):
    base = {'id': 1, 'title': 'iPhone 13 128', 'price': 40000, 'city': 'Ижевск',
            'category': 'Электроника', 'published_hours_ago': 3,
            'photos': '["https://x/1.jpg"]', 'description': '', 'seller_type': ''}
    base.update(kw)
    return base


def crit(**kw):
    base = {'id': 1, 'user_id': 1, 'query': 'iphone 13', 'mode': 'any', 'min_discount': 15,
            'max_price': 0, 'min_price': 0, 'max_hours': 0, 'with_photo': 0,
            'condition': '', 'category': '', 'city': '', 'requirements': '',
            'median_price': 24990, 'sample_size': 20}
    base.update(kw)
    return base


# ── D3: подозрительные цены
d = evaluate(ad(price=53), crit())
assert (not d.ok) and d.reason == 'price_below_floor', d
d = evaluate(ad(price=5000), crit())          # 20% медианы → скидка 80%
assert (not d.ok) and d.reason == 'price_suspect', d
assert 'подозрительно' in d.label, d.label
d = evaluate(ad(price=9000), crit())          # 36% медианы → скидка 64%
assert d.ok and d.discount == 64, d
d = evaluate(ad(price=8000, title='iPhone 13'), crit())
assert d.ok and d.discount == 68, d           # 68% < 70% — обычная находка
print('1) D3: 53 ₽ → ниже пола, 5 000 ₽ (скидка 80%) → price_suspect, 8 000 ₽ (68%) → проходит')

# ── D5: оценка возраста
assert hours_ago({'published_hours_ago': 5}) == 5
estimated = {'published_hours_ago': None, 'age_estimated': 1,
             'parsed_at': (NOW - timedelta(hours=7)).isoformat()}
assert hours_ago(estimated) == 7, hours_ago(estimated)
d = evaluate(ad(published_hours_ago=None, age_estimated=1,
                parsed_at=(NOW - timedelta(hours=2)).isoformat()), crit(max_hours=24))
assert d.ok and d.reason == 'date_estimated', d
# старше порога — всё равно отказ, оценка не делает объявление вечно свежим
d = evaluate(ad(published_hours_ago=None, age_estimated=1,
                parsed_at=(NOW - timedelta(hours=100)).isoformat()), crit())
assert (not d.ok) and d.reason == 'stale', d
print('2) D5: оценённый возраст считается от parsed_at и стареет вместе с ним')

# ── D8: снижение цены
conn.execute("INSERT INTO ads (id, title, price, market_median, status, parsed_at, "
             "published_hours_ago) VALUES (10, 'iPhone 13', 10000, 20000, 'active', ?, 3)",
             (NOW.isoformat(),))
conn.execute("INSERT INTO hunt_matches (user_id, crit_id, ad_id, status, reason, "
             "discount, created_at, updated_at) VALUES (7, 1, 10, 'sent', 'ok_discount', "
             "50, ?, ?)", (NOW.isoformat(), NOW.isoformat()))
conn.commit()
stats = {'ids': [], 'price_drop': 0}
cur = conn.cursor()
assert price_drop(cur, 10, 10000, 9000, None, NOW.isoformat(), stats) is True
row = conn.execute("SELECT * FROM ads WHERE id=10").fetchone()
assert row['price'] == 9000 and row['prev_price'] == 10000, dict(row)
assert row['discount_percent'] == 55, dict(row)
assert conn.execute("SELECT COUNT(*) AS n FROM ads_price_history WHERE ad_id=10").fetchone()['n'] == 1
m = conn.execute("SELECT * FROM hunt_matches WHERE ad_id=10").fetchone()
assert m['status'] == 'ready' and m['reason'] == 'price_drop', dict(m)
assert stats['price_drop'] == 1 and 10 in stats['ids'], stats
print('3) D8: цена снижена на 10% → цена и скидка обновлены, история записана, находка открыта заново')

# Второе снижение в тот же день: цену обновляем, но человека не дёргаем
conn.execute("UPDATE hunt_matches SET status='sent' WHERE ad_id=10")
conn.commit()
stats2 = {'ids': [], 'price_drop': 0}
assert price_drop(cur, 10, 9000, 8000, NOW.isoformat(), NOW.isoformat(), stats2) is True
m = conn.execute("SELECT * FROM hunt_matches WHERE ad_id=10").fetchone()
assert m['status'] == 'sent', 'уведомили второй раз за сутки'
print('4) D8: второе снижение за сутки — цену обновили, уведомление не отправляем')

# Мелкое снижение и рост цены снижением не считаем
assert price_drop(cur, 10, 8000, 7900, None, NOW.isoformat(), {'ids': [], 'price_drop': 0}) is False
assert price_drop(cur, 10, 8000, 8500, None, NOW.isoformat(), {'ids': [], 'price_drop': 0}) is False
print('5) D8: рост цены и снижение меньше 5% — не новость')

print('\nD3/D5/D8: все проверки пройдены')
