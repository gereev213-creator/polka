"""Тесты этапа A3/A5: кого сервер просит у сборщика и как повторяет неудачи.

hunt_need_details вырезается из настоящего бота и работает на настоящем
SQLite: проверяем, что просим только нужные карточки, не чаще 30 минут и
не больше трёх раз.

Запуск: python3 tests/test_need_details.py
"""
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional, NamedTuple

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'HUNT_ACCESSORY_TITLE_WORDS', 'HUNT_ACCESSORY_CATEGORY_HINTS', '_CONDITION_RANK',
          '_CONDITION_PARTS', '_CONDITION_BROKEN', '_CONDITION_WORN', '_CONDITION_EXCELLENT',
          '_CONDITION_GOOD', '_CONDITION_NEW', '_negated_window', 'classify_condition',
          'extract_battery_percent', 'requirements_json_from_text', '_crit_requirements_json',
          '_title_has_accessory', '_accessory_before_model', '_OPENED_MARKERS', '_opened_markers_hit',
          'evaluate_ad', '_condition_ok', '_query_alt_numbers', '_query_words_required',
          'query_word_variants', '_query_word_variants_orig', '_requirement_excludes',
          'HUNT_ACCESSORY_WORDS',
          'HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START', 'HUNT_CONDITION_WORDS',
          '_ad_hours_ago', 'HUNT_SUSPECT_DISCOUNT', 'HUNT_PRICE_DROP_PERCENT', 'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_JUNK_ANYWHERE', 'HUNT_NEGATION_WORDS', 'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_RE_JUNK_ANYWHERE', 'HUNT_RE_JUNK_START', 'HUNT_RE_CONDITION', 'HUNT_RE_NEGATION', 'HUNT_RE_SHOP', 'HUNT_RE_SHOP_MATCH', '_hunt_word_pattern', '_hunt_asked_stems', '_hunt_marker_asked', 'hunt_junk_word', 'hunt_junk_start_word', 'hunt_condition_word', 'hunt_shop_in_name',
          'HUNT_REPLICA_MARKERS', 'HUNT_SHOP_MARKERS',
          'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS', 'HUNT_STOP_WORDS', 'HUNT_STRICT_MODEL_HINTS', '_hunt_extra_qualifier', '_crit_excluded', '_crit_exclude_words', 'QUERY_SYNONYMS',
          'QUALIFIER_RU', 'HUNT_MODEL_QUALIFIERS', 'HUNT_TITLE_START_JUNK',
          'HUNT_FRESH_HOURS', 'HUNT_ALLOW_UNDATED', 'HUNT_MIN_PRICE_SHARE',
          'HUNT_DESC_PER_PASS', 'HUNT_DESC_RETRY_MIN', 'HUNT_DESC_MAX_TRIES',
          'hunt_need_details')


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


class FakeLog:
    def error(self, *a, **k):
        pass

    def warning(self, *a, **k):
        pass


NOW = datetime(2026, 10, 13, 12, 0, 0)
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
    CREATE TABLE ads (id INTEGER PRIMARY KEY, title TEXT, title_lower TEXT, price INTEGER,
                      city TEXT, category TEXT, description TEXT, photos TEXT,
                      published_hours_ago INTEGER, seller_type TEXT, seller_name TEXT,
                      status TEXT, source TEXT, source_url TEXT, external_id TEXT,
                      desc_state TEXT DEFAULT '', desc_attempts INTEGER DEFAULT 0,
                      desc_checked_at TEXT);
    CREATE TABLE hunt_criteria (id INTEGER PRIMARY KEY, user_id INTEGER, query TEXT,
                                category TEXT, city TEXT, max_price INTEGER, min_price INTEGER,
                                max_hours INTEGER, with_photo INTEGER, min_discount INTEGER,
                                median_price INTEGER, sample_size INTEGER, active INTEGER,
                                created_at TEXT, mode TEXT, requirements TEXT, condition TEXT);
''')

ns = {'os': os, 'json': json, 're': re, 'sqlite3': sqlite3, 'NamedTuple': NamedTuple, 'Dict': Dict,
      'List': List, 'Optional': Optional, 'Tuple': tuple, 'logger': FakeLog(),
      'db': type('D', (), {'conn': conn})(),
      'get_moscow_time': lambda: NOW,
      'timedelta': timedelta,
      'is_finding_hidden': lambda uid, ad_id: False}

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

need = ns['hunt_need_details']


def add_ad(ad_id, title, ext, description='', attempts=0, checked=None):
    conn.execute("INSERT INTO ads (id, title, title_lower, price, city, category, description, "
                 "photos, published_hours_ago, seller_type, status, source, source_url, "
                 "external_id, desc_attempts, desc_checked_at) "
                 "VALUES (?,?,?,40000,'Ижевск','Электроника',?,'[\"http://x/1.jpg\"]',3,'',"
                 "'active','avito',?,?,?,?)",
                 (ad_id, title, title.lower(), description,
                  f'https://www.avito.ru/x_{ext}', ext, attempts, checked))


# Критерий с требованиями словами — описания нужны (id 10), и без них (id 11)
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, active, mode, min_discount, "
             "median_price, sample_size, created_at, requirements) "
             "VALUES (10, 1, 'iphone 13', 1, 'any', 15, 50000, 20, '2026-10-13', "
             "'хорошее состояние')")
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, active, mode, min_discount, "
             "median_price, sample_size, created_at, requirements) "
             "VALUES (11, 2, 'iphone 13', 1, 'any', 15, 50000, 20, '2026-10-13', '')")
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, active, mode, min_discount, "
             "median_price, sample_size, created_at, requirements, condition) "
             "VALUES (12, 3, 'iphone 13', 1, 'any', 15, 50000, 20, '2026-10-13', '', 'new')")
conn.commit()

add_ad(1, 'iPhone 13 128', '111')                                  # кандидат (описания нет)
add_ad(2, 'iPhone 13 256', '222', description='Уже есть описание')  # описание уже есть
add_ad(3, 'iPhone 13 Pro', '333', attempts=3)                      # три попытки — хватит
add_ad(4, 'iPhone 13 mini', '444', checked=NOW.isoformat())        # проверяли только что
add_ad(5, 'iPhone 14', '555')                                      # не подходит по модели
conn.commit()

rows = need()
by_ext = {r['external_id']: r for r in rows}
assert set(by_ext) == {'111'}, by_ext
assert by_ext['111']['id'] == 1 and by_ext['111']['url'].startswith('https://'), by_ext
print('1) просим только кандидата с пустым описанием, который проходит по заголовку и цене')

# Критерий с condition='new' тоже требует описания
conn.execute("DELETE FROM hunt_criteria WHERE id IN (10, 11)")
conn.commit()
rows = need()
assert {r['external_id'] for r in rows} == {'111'}, rows
print('2) критерий с условием по состоянию тоже требует описания')

# Прошло 30 минут — карточку можно спросить снова
conn.execute("DELETE FROM hunt_criteria WHERE id = 12")
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, active, mode, min_discount, "
             "median_price, sample_size, created_at, requirements) "
             "VALUES (10, 1, 'iphone 13', 1, 'any', 15, 50000, 20, '2026-10-13', "
             "'хорошее состояние')")
conn.execute("UPDATE ads SET desc_checked_at=? WHERE id=4",
             ((NOW - timedelta(minutes=31)).isoformat(),))
conn.commit()
rows = need(ad_ids=[4])
assert {r['external_id'] for r in rows} == {'444'}, rows
print('3) через 31 минуту неудачную карточку спрашиваем снова')

# А сразу после попытки — не спрашиваем
rows = need(ad_ids=[4])
try:
    conn.execute("UPDATE ads SET desc_checked_at=? WHERE id=4", (NOW.isoformat(),))
    conn.commit()
    rows = need(ad_ids=[4])
    assert rows == [], rows
except AssertionError:
    raise
print('4) сразу после попытки не спрашиваем (защита от долбёжки)')

# Больше трёх попыток — не спрашиваем никогда
conn.execute("UPDATE ads SET desc_attempts=3, desc_checked_at=NULL WHERE id=1")
conn.commit()
assert need() == [], need()
print('5) после трёх неудач карточку больше не просим')

# Лимит за проход
conn.execute("UPDATE ads SET desc_attempts=0, desc_checked_at=NULL WHERE id=1")
for i in range(10, 60):
    add_ad(i, f'iPhone 13 lot {i}', str(i))
conn.commit()
rows = need()
assert len(rows) == ns['HUNT_DESC_PER_PASS'], len(rows)
print(f"6) за проход просим не больше {ns['HUNT_DESC_PER_PASS']} карточек")

print('\nA3/A5: все проверки пройдены')
