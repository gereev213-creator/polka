"""Тесты этапа C: очередь доставки.

Атомарный захват, возврат в очередь, повтор неудач, «ждём описание» дольше
30 минут и пометка «бот заблокирован» — на настоящем коде бота и SQLite.

Запуск: python3 tests/test_delivery_queue.py
"""
import html as _html_mod
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

TOKENS = ('CATEGORY_BY_WORD', '_query_subject_word', 'HUNT_MODIFIER_WORDS', 'query_word_variants', 'Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'HUNT_ACCESSORY_TITLE_WORDS', 'HUNT_ACCESSORY_CATEGORY_HINTS', '_CONDITION_RANK',
          '_CONDITION_PARTS', '_CONDITION_BROKEN', '_CONDITION_WORN', '_CONDITION_EXCELLENT',
          '_CONDITION_GOOD', '_CONDITION_NEW', '_negated_window', 'hunt_defect_phrase', 'HUNT_DEFECT_PHRASES', 'classify_condition',
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
          'HUNT_WORKER_BATCH', 'HUNT_WORKER_EVERY', 'HUNT_SEND_MAX_TRIES',
          'HUNT_SEND_RETRY_MIN', 'HUNT_PENDING_MAX_MIN', 'HUNT_DESC_MAX_TRIES',
          'ensure_hunt_matches', 'hunt_match_store', 'hunt_matches_recompute',
          'hunt_match_mark_sent', 'hunt_ready_ids', 'hunt_claim_batch', 'hunt_release',
          'hunt_retry_failed', 'hunt_flush_stale_pending', 'hunt_note_blocked',
          'hunt_is_blocked', 'hunt_stats_text', '_hunt_escape')


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


NOW = [datetime(2026, 10, 13, 12, 0, 0)]
settings = {}

conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
    CREATE TABLE ads (id INTEGER PRIMARY KEY, title TEXT, title_lower TEXT, price INTEGER,
                      city TEXT, category TEXT, description TEXT, photos TEXT,
                      published_hours_ago INTEGER, seller_type TEXT, seller_name TEXT,
                      status TEXT, source TEXT, source_url TEXT, external_id TEXT,
                      desc_attempts INTEGER DEFAULT 0, desc_checked_at TEXT);
    CREATE TABLE hunt_criteria (id INTEGER PRIMARY KEY, user_id INTEGER, query TEXT,
                                category TEXT, city TEXT, max_price INTEGER, min_price INTEGER,
                                max_hours INTEGER, with_photo INTEGER, min_discount INTEGER,
                                median_price INTEGER, sample_size INTEGER, active INTEGER,
                                created_at TEXT, mode TEXT, requirements TEXT);
''')

ns = {'os': os, 'json': json, 're': re, 'sqlite3': sqlite3, '_html': _html_mod, 'NamedTuple': NamedTuple, 'Dict': Dict,
      'List': List, 'Optional': Optional, 'Tuple': tuple, 'logger': FakeLog(),
      'db': type('D', (), {'conn': conn, 'is_search_notification_sent':
                           lambda self, u, a: False})(),
      'get_moscow_time': lambda: NOW[0],
      'timedelta': timedelta,
      'is_finding_hidden': lambda uid, ad_id: False,
      '_setting_get': lambda k, d='': settings.get(k, d),
      '_setting_set': lambda k, v: settings.__setitem__(k, v),
      '_hunt_note_send': lambda **k: None}

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

ns['ensure_hunt_matches']()
claim = ns['hunt_claim_batch']
release = ns['hunt_release']
retry = ns['hunt_retry_failed']
flush = ns['hunt_flush_stale_pending']
note_blocked, is_blocked = ns['hunt_note_blocked'], ns['hunt_is_blocked']
stats_text = ns['hunt_stats_text']


def add_row(ad_id, status='ready', discount=10, created=None, updated=None,
            attempts=0, error='', user=7, crit=10):
    stamp = (created or NOW[0]).isoformat()
    conn.execute("INSERT INTO hunt_matches (user_id, crit_id, ad_id, status, reason, "
                 "reject_reason, discount, desc_state, created_at, updated_at, delivery, "
                 "send_attempts, send_error) "
                 "VALUES (?,?,?,?, '', '', ?, '', ?, ?, '', ?, ?)",
                 (user, crit, ad_id, status, discount, stamp,
                  (updated or NOW[0]).isoformat(), attempts, error))
    conn.commit()


# ── 1. Атомарный захват: одну запись не выдадут дважды
for i in (1, 2, 3):
    add_row(i, discount=i * 10)
first = claim(limit=2)
assert len(first) == 2 and all(r['status'] == 'sending' for r in first), first
second = claim(limit=2)
assert len(second) == 1, second
ids = {r['id'] for r in first} | {r['id'] for r in second}
assert len(ids) == 3, 'одна и та же запись выдана дважды'
assert claim(limit=5) == [], 'очередь не опустела'
print('1) захват пачки: 2 + 1 запись, повторов нет, очередь пустеет')

# ── 2. Возврат в очередь и неудача с причиной
release(second, 'ready')
assert claim(limit=5)[0]['id'] == second[0]['id'], 'запись не вернулась в очередь'
release(first[:1], 'send_failed', 'timed out')
row = conn.execute("SELECT * FROM hunt_matches WHERE id=?", (first[0]['id'],)).fetchone()
assert row['status'] == 'send_failed' and row['send_error'] == 'timed out', dict(row)
assert row['send_attempts'] == 1, dict(row)
release(first[1:], 'rejected', 'crit_inactive')
row = conn.execute("SELECT * FROM hunt_matches WHERE id=?", (first[1]['id'],)).fetchone()
assert row['status'] == 'rejected' and row['reject_reason'] == 'crit_inactive', dict(row)
print('2) возврат в очередь, send_failed с ошибкой и rejected с причиной')

# ── 3. Повтор неудач: не сразу, не бесконечно, не для заблокированных
NOW[0] = NOW[0] + timedelta(minutes=1)
assert retry() == 0, 'повторили слишком рано'
NOW[0] = NOW[0] + timedelta(minutes=11)
assert retry() == 1, 'не вернули неудачную отправку в очередь'
row = conn.execute("SELECT * FROM hunt_matches WHERE id=?", (first[0]['id'],)).fetchone()
assert row['status'] == 'ready', dict(row)
# исчерпал попытки
conn.execute("UPDATE hunt_matches SET status='send_failed', send_attempts=? WHERE id=?",
             (ns['HUNT_SEND_MAX_TRIES'], first[0]['id']))
conn.commit()
NOW[0] = NOW[0] + timedelta(minutes=11)
assert retry() == 0, 'повторяем сверх лимита попыток'
# заблокировал бота — не повторяем
conn.execute("UPDATE hunt_matches SET send_attempts=0, send_error='bot_blocked' WHERE id=?",
             (first[0]['id'],))
conn.commit()
NOW[0] = NOW[0] + timedelta(minutes=11)
assert retry() == 0, 'повторяем тому, кто заблокировал бота'
print('3) повтор: через 10 минут, максимум 3 раза, заблокированных не трогаем')

# ── 4. «Ждём описание» дольше 30 минут → отправляем с пометкой
add_row(20, status='pending_details', created=NOW[0] - timedelta(minutes=40))
add_row(21, status='pending_details', created=NOW[0] - timedelta(minutes=5))
# Отправляем с пометкой только тех, по кому сборщик РЕАЛЬНО пытался и не смог
# (попытки исчерпаны). Иначе находка уходила «описание не проверено» даже
# тогда, когда телефон до неё ещё не дошёл (например был под троттлингом 439).
# Строки объявлений нужны: проверяем, что сборщик РЕАЛЬНО пытался открыть
# описание (попытки исчерпаны), а не просто не дошёл до карточки.
conn.execute("INSERT OR REPLACE INTO ads (id, title, desc_attempts) VALUES (20,'тест',3)")
conn.commit()
flush()
# Проверяем адресно: старое с исчерпанными попытками ушло, свежее осталось ждать
_st20 = conn.execute("SELECT status FROM hunt_matches WHERE ad_id=20").fetchone()[0]
_st21 = conn.execute("SELECT status FROM hunt_matches WHERE ad_id=21").fetchone()[0]
assert _st20 == 'ready', _st20
assert _st21 == 'pending_details', _st21
# Старое, но БЕЗ попыток — продолжаем ждать, а не отправляем непроверенным
add_row(22, status='pending_details', created=NOW[0] - timedelta(minutes=40))
conn.execute("INSERT OR REPLACE INTO ads (id, title, desc_attempts) VALUES (22,'тест',0)")
conn.commit()
assert flush() == 0, 'без единой попытки открыть описание отправлять нельзя'
old = conn.execute("SELECT * FROM hunt_matches WHERE ad_id=20").fetchone()
young = conn.execute("SELECT * FROM hunt_matches WHERE ad_id=21").fetchone()
assert old['status'] == 'ready' and old['reason'] == 'desc_failed', dict(old)
assert old['desc_state'] == 'failed', dict(old)
assert young['status'] == 'pending_details', dict(young)
print('4) висящее «ждём описание» уходит в отправку с пометкой, свежее — ждёт')

# ── 5. Пометка «бот заблокирован»
assert not is_blocked(7)
note_blocked(7, 'Forbidden: bot was blocked by the user')
assert is_blocked(7) and not is_blocked(8)
print('5) блокировка бота запоминается по пользователю')

# ── 6. Сводка для админа
add_row(30, status='sent')
add_row(31, status='rejected')
add_row(32, status='ready')
conn.execute("UPDATE hunt_matches SET reject_reason='price_below_floor' WHERE ad_id=31")
conn.commit()
text = stats_text()
assert 'ready' in text and 'sent' in text and 'price_below_floor' in text, text
assert 'Очередь доставки' in text and str(ns['HUNT_WORKER_BATCH']) in text, text
print('6) /hunt_stats: статусы, причины отказов, параметры воркера')

print('\nC: все проверки пройдены')
