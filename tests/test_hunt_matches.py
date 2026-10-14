"""Тесты этапа B: таблица решений hunt_matches.

Проверяем на настоящем коде бота и настоящем SQLite (в памяти): статусы
ready / pending_details / rejected / sent, причины отказа, пометку отправки
и то, что повторный пересчёт не «оживляет» уже отправленное.

Запуск: python3 tests/test_hunt_matches.py
"""
import asyncio
import json
import os
import re
import sqlite3
import sys
from datetime import datetime
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
          'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS', 'HUNT_STOP_WORDS', 'QUERY_SYNONYMS',
          'QUALIFIER_RU', 'HUNT_MODEL_QUALIFIERS', 'HUNT_TITLE_START_JUNK',
          'HUNT_FRESH_HOURS', 'HUNT_ALLOW_UNDATED', 'HUNT_MIN_PRICE_SHARE',
          'ensure_hunt_matches', 'hunt_match_store', 'hunt_matches_recompute',
          'hunt_matches_recompute_async', 'hunt_match_mark_sent', 'hunt_ready_ids')


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


class FakeDb:
    """Заглушка базы: только то, что нужно пересчёту решений."""

    def __init__(self, conn):
        self.conn = conn
        self.sent_markers = set()

    def is_search_notification_sent(self, user_id, ad_id):
        return (int(user_id), int(ad_id)) in self.sent_markers


class FakeLog:
    def error(self, *a, **k):
        pass

    def warning(self, *a, **k):
        pass


conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
    CREATE TABLE ads (id INTEGER PRIMARY KEY, title TEXT, title_lower TEXT, price INTEGER,
                      city TEXT, category TEXT, description TEXT, photos TEXT,
                      published_hours_ago INTEGER, seller_type TEXT, seller_name TEXT,
                      status TEXT, source TEXT, source_url TEXT, external_id TEXT);
    CREATE TABLE hunt_criteria (id INTEGER PRIMARY KEY, user_id INTEGER, query TEXT,
                                category TEXT, city TEXT, max_price INTEGER, min_price INTEGER,
                                max_hours INTEGER, with_photo INTEGER, min_discount INTEGER,
                                median_price INTEGER, sample_size INTEGER, active INTEGER,
                                created_at TEXT, mode TEXT, requirements TEXT);
''')

ns = {'os': os, 'json': json, 're': re, 'sqlite3': sqlite3, 'asyncio': asyncio, 'NamedTuple': NamedTuple, 'Dict': Dict,
      'List': List, 'Optional': Optional, 'Tuple': tuple, 'logger': FakeLog(),
      'db': FakeDb(conn),
      'get_moscow_time': lambda: datetime(2026, 10, 13, 12, 0, 0),
      'is_finding_hidden': lambda uid, ad_id: False}

picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS:
        picked.append((n, '\n'.join(chunk)))
found = {n for n, _ in picked}
assert not found - set(TOKENS)
missing = [n for n in TOKENS if n not in found]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

ensure, recompute = ns['ensure_hunt_matches'], ns['hunt_matches_recompute']
store, mark_sent, ready_ids = ns['hunt_match_store'], ns['hunt_match_mark_sent'], ns['hunt_ready_ids']
Decision = ns['Decision']

ensure()

# ── Данные: три объявления и два критерия
conn.execute("INSERT INTO ads (id, title, title_lower, price, city, category, description, "
             "photos, published_hours_ago, seller_type, status, source) "
             "VALUES (1,'iPhone 13 128','iphone 13 128',40000,'Ижевск','Электроника','',"
             "'[\"http://x/1.jpg\"]',3,'','active','avito')")
conn.execute("INSERT INTO ads (id, title, title_lower, price, city, category, description, "
             "photos, published_hours_ago, seller_type, status, source) "
             "VALUES (2,'iPhone 13 Pro','iphone 13 pro',53,'Ижевск','Электроника','',"
             "'[\"http://x/2.jpg\"]',3,'','active','avito')")
conn.execute("INSERT INTO ads (id, title, title_lower, price, city, category, description, "
             "photos, published_hours_ago, seller_type, status, source) "
             "VALUES (3,'iPhone 13 mini','iphone 13 mini',35000,'Москва','Электроника','',"
             "'[\"http://x/3.jpg\"]',3,'company','active','avito')")
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, category, city, max_price, "
             "min_price, max_hours, with_photo, min_discount, median_price, sample_size, "
             "active, created_at, mode, requirements) "
             "VALUES (10,7,'iphone 13','','',0,0,0,0,15,50000,20,1,'2026-10-13','any','')")
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, category, city, max_price, "
             "min_price, max_hours, with_photo, min_discount, median_price, sample_size, "
             "active, created_at, mode, requirements) "
             "VALUES (11,8,'iphone 13','','',0,0,0,0,15,NULL,2,1,'2026-10-13','deal','')")
conn.commit()

written = recompute(ad_ids=[1, 2, 3])
assert written == 6, written
rows = {r['ad_id']: r for r in conn.execute(
    "SELECT * FROM hunt_matches WHERE user_id=7 ORDER BY ad_id").fetchall()}

# 1. Обычное совпадение → ready
assert rows[1]['status'] == 'ready', dict(rows[1])
assert rows[1]['discount'] == 20, dict(rows[1])
assert rows[1]['reason'] == 'ok_discount', dict(rows[1])
print('1) совпадение со скидкой 20% → status=ready, reason=ok_discount')

# 2. Цена 53 ₽ при медиане 50 000 → rejected с видимой причиной
assert rows[2]['status'] == 'rejected', dict(rows[2])
assert rows[2]['reject_reason'] == 'price_below_floor', dict(rows[2])
print('2) 53 ₽ при медиане 50 000 → status=rejected, reject_reason=price_below_floor')

# 3. Город не тот → rejected причина city_mismatch (у критерия 7 город пустой,
#    поэтому добавляем критерий с городом и смотрим на него)
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, category, city, max_price, "
             "min_price, max_hours, with_photo, min_discount, median_price, sample_size, "
             "active, created_at, mode, requirements) "
             "VALUES (12,9,'iphone 13','','Ижевск',0,0,0,0,15,50000,20,1,'2026-10-13','any','')")
conn.commit()
recompute(ad_ids=[3])
row = conn.execute("SELECT * FROM hunt_matches WHERE user_id=9 AND ad_id=3").fetchone()
assert row['status'] == 'rejected' and row['reject_reason'] == 'city_mismatch', dict(row)
print('3) другой город → status=rejected, reject_reason=city_mismatch')

# 4. Режим «только выгодные» без медианы → no_median
row = conn.execute("SELECT * FROM hunt_matches WHERE user_id=8 AND ad_id=1").fetchone()
assert row['status'] == 'rejected' and row['reject_reason'] == 'no_median', dict(row)
print('4) режим deal без медианы → status=rejected, reject_reason=no_median')

# 5. Критерий с требованием описания, описания нет → pending_details
conn.execute("UPDATE ads SET description='' WHERE id=1")
conn.execute("UPDATE hunt_criteria SET requirements='хорошее состояние' WHERE id=10")
conn.commit()
recompute(ad_ids=[1])
row = conn.execute("SELECT * FROM hunt_matches WHERE user_id=7 AND ad_id=1").fetchone()
assert row['status'] == 'pending_details', dict(row)
assert row['desc_state'] == 'pending', dict(row)
print('5) нет описания, а критерий его требует → status=pending_details, desc_state=pending')

# 6. Описание пришло → ready, desc_state=ok
conn.execute("UPDATE ads SET description='Состояние хорошее, без царапин' WHERE id=1")
conn.commit()
recompute(ad_ids=[1])
row = conn.execute("SELECT * FROM hunt_matches WHERE user_id=7 AND ad_id=1").fetchone()
assert row['status'] == 'ready' and row['desc_state'] == 'ok', dict(row)
print('6) описание пришло и подходит → status=ready, desc_state=ok')

# 7. Отправка: статус sent, повторный пересчёт не откатывает
mark_sent(7, 1, 'chat')
row = conn.execute("SELECT * FROM hunt_matches WHERE user_id=7 AND ad_id=1").fetchone()
assert row['status'] == 'sent' and row['delivery'] == 'chat' and row['notified_at'], dict(row)
assert 1 not in ready_ids(crit_id=10), 'отправленное не должно попадать в очередь'
recompute(ad_ids=[1])
row = conn.execute("SELECT * FROM hunt_matches WHERE user_id=7 AND ad_id=1").fetchone()
assert row['status'] == 'sent', f'отправленное откатилось: {dict(row)}'
print('7) mark_sent → sent, из очереди уходит, повторный пересчёт не откатывает')

# 8. Старая отметка об отправке (search_notifications_sent) тоже даёт sent
ns['db'].sent_markers.add((7, 3))
conn.execute("UPDATE ads SET city='Ижевск' WHERE id=3")
conn.commit()
recompute(ad_ids=[3])
row = conn.execute("SELECT * FROM hunt_matches WHERE user_id=7 AND ad_id=3").fetchone()
assert row['status'] == 'sent', dict(row)
print('8) отметка прошлых отправок учитывается: status=sent')

# 9. UNIQUE(user_id, ad_id): повторный пересчёт не создаёт дублей
#    (у критерия 12 свой пользователь, его записи считаем отдельно)
q = "SELECT COUNT(*) AS n FROM hunt_matches WHERE user_id IN (7, 8)"
before = conn.execute(q).fetchone()['n']
recompute(ad_ids=[1, 2, 3])
after = conn.execute(q).fetchone()['n']
assert before == after, (before, after)
print(f'9) дублей нет: записей до {before}, после {after}')

print('\nB: hunt_matches — все проверки пройдены')

# ── 10. Пересчёт порциями: only_missing и async-обёртка
conn.execute("INSERT INTO hunt_criteria (id, user_id, query, category, city, max_price, "
             "min_price, max_hours, with_photo, min_discount, median_price, sample_size, "
             "active, created_at, mode, requirements) "
             "VALUES (20, 11, 'iphone 13', '', '', 0, 0, 0, 0, 15, 50000, 20, 1, "
             "'2026-10-13', 'any', '')")
for i in range(100, 160):
    conn.execute("INSERT INTO ads (id, title, title_lower, price, city, category, description, "
                 "photos, published_hours_ago, seller_type, status, source) "
                 "VALUES (?, 'iPhone 13 lot', 'iphone 13 lot', 40000, 'Ижевск', 'Электроника', "
                 "'', '[\"http://x/1.jpg\"]', 3, '', 'active', 'avito')", (i,))
conn.commit()

before = conn.execute("SELECT COUNT(*) AS n FROM hunt_matches WHERE user_id=11").fetchone()['n']
assert before == 0, before
written = ns['hunt_matches_recompute'](crit_id=20, limit_ads=60, only_missing=True)
rows = conn.execute("SELECT COUNT(*) AS n FROM hunt_matches WHERE user_id=11").fetchone()['n']
assert rows == 60, (written, rows)
# повторный проход ничего не делает: решения уже есть
again = ns['hunt_matches_recompute'](crit_id=20, limit_ads=60, only_missing=True)
rows2 = conn.execute("SELECT COUNT(*) AS n FROM hunt_matches WHERE user_id=11").fetchone()['n']
assert again == 0 and rows2 == 60, (again, rows2)
print('10) only_missing: 60 решений с первого прохода, повторный — 0 работы')

# async-обёртка считает порциями и доходит до конца
for i in range(200, 230):
    conn.execute("INSERT INTO ads (id, title, title_lower, price, city, category, description, "
                 "photos, published_hours_ago, seller_type, status, source) "
                 "VALUES (?, 'iPhone 13 fresh', 'iphone 13 fresh', 40000, 'Ижевск', "
                 "'Электроника', '', '[\"http://x/1.jpg\"]', 3, '', 'active', 'avito')", (i,))
conn.commit()
done = asyncio.run(ns['hunt_matches_recompute_async'](crit_id=20, limit_ads=30,
                                                      only_missing=True, batch=10))
rows3 = conn.execute("SELECT COUNT(*) AS n FROM hunt_matches WHERE user_id=11").fetchone()['n']
assert rows3 == 90, (done, rows3)
print('11) async-пересчёт идёт порциями по 10 и обрабатывает все 30 объявлений')

print('\nB: hunt_matches — все проверки пройдены (включая порционный пересчёт)')
