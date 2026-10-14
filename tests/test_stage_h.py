"""Тесты этапа H: план, пробный период, лимиты, монеты.

Запуск: python3 tests/test_stage_h.py
"""
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

TOKENS = ('PLAN_FREE_MAX_CRITERIA', 'PLAN_FREE_DELAY_MIN', 'PLAN_TRIAL_DAYS',
          'PLAN_TRIAL_MAX_CRITERIA', 'PLAN_PLUS_MAX_CRITERIA', 'PLAN_REF_MAX_BONUS',
          'PLAN_PLUS_PRICE', 'PLAN_PLUS_SHOW_PRICE',
          'COIN_UNLOCK_PRICE', 'COIN_DEEP_CHECK_PRICE', 'COIN_CRITERION_DAY_PRICE',
          'ensure_monetization', '_referral_criteria_bonus', '_user_plan',
          '_criteria_limit', '_pause_extra_criteria', 'coins_balance', 'coins_add',
          'coins_spend', '_hours_since', '_safe_isoparse')


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
settings = {}
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
    CREATE TABLE users (user_id INTEGER PRIMARY KEY, plan TEXT DEFAULT '',
        trial_started_at TEXT, registration_date TEXT);
    CREATE TABLE hunt_criteria (id INTEGER PRIMARY KEY, user_id INTEGER, query TEXT,
        active INTEGER DEFAULT 1, paused_reason TEXT);
    CREATE TABLE referrals (referrer_id INTEGER, referred_id INTEGER PRIMARY KEY, created_at TEXT);
''')

class FakeDb:
    def __init__(self, c):
        self.conn = c
    def get_user(self, uid):
        r = self.conn.execute("SELECT * FROM users WHERE user_id=?", (int(uid),)).fetchone()
        return dict(r) if r else None
    def update_user(self, uid, **kw):
        cols = ", ".join(f"{k}=?" for k in kw)
        self.conn.execute(f"UPDATE users SET {cols} WHERE user_id=?",
                          (*kw.values(), int(uid)))
        self.conn.commit()

class FakeLog:
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass
    def info(self, *a, **k): pass

ns = {'os': os, 'json': json, 're': re, 'sqlite3': sqlite3, 'Dict': Dict, 'List': List,
      'Optional': Optional, 'Tuple': tuple, 'datetime': datetime, 'timedelta': timedelta,
      'ZoneInfo': ZoneInfo, 'db': FakeDb(conn), 'logger': FakeLog(),
      'get_moscow_time': lambda: NOW,
      '_setting_get': lambda k, d='': settings.get(k, d),
      '_setting_set': lambda k, v: settings.__setitem__(k, v)}
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

ns['ensure_monetization']()
user_plan = ns['_user_plan']
crit_limit = ns['_criteria_limit']
pause = ns['_pause_extra_criteria']
cadd, cspend, cbal = ns['coins_add'], ns['coins_spend'], ns['coins_balance']
ok = 0

# ── 1. Новый пользователь — пробный период с лимитом 5
conn.execute("INSERT INTO users (user_id, registration_date) VALUES (1, ?)",
             ((NOW - timedelta(days=1)).isoformat(),))
conn.commit()
p = user_plan(1)
assert p['name'] == 'trial' and p['criteria_limit'] == 5 and p['deep_check'] is True, p
assert conn.execute("SELECT plan FROM users WHERE user_id=1").fetchone()['plan'] == 'trial'
ok += 1
print('1) новый пользователь → пробный период, лимит 5 критериев, тщательный отбор')

# ── 2. Пробный период истёк → free с лимитом 1 и паузой лишних
conn.execute("UPDATE users SET trial_started_at=? WHERE user_id=1",
             ((NOW - timedelta(days=30)).isoformat(),))
for i in range(4):
    conn.execute("INSERT INTO hunt_criteria (user_id, query, active) VALUES (1, ?, 1)", (f'q{i}',))
conn.commit()
p = user_plan(1)
assert p['name'] == 'free' and p['criteria_limit'] == 1, p
active = conn.execute("SELECT COUNT(*) AS n FROM hunt_criteria WHERE user_id=1 AND active=1").fetchone()['n']
paused = conn.execute("SELECT COUNT(*) AS n FROM hunt_criteria WHERE user_id=1 AND paused_reason='limit'").fetchone()['n']
assert active == 1 and paused == 3, (active, paused)
ok += 1
print('2) пробный период истёк → free, лишние 3 критерия приостановлены (не удалены)')

# ── 3. Реферальный бонус +1 (максимум 3)
conn.execute("UPDATE users SET trial_started_at=NULL, plan='free' WHERE user_id=1")
for r in range(5):
    conn.execute("INSERT OR IGNORE INTO referrals (referrer_id, referred_id) VALUES (1, ?)",
                 (100 + r,))
conn.commit()
assert crit_limit(1) == 1 + 3, crit_limit(1)   # free=1 + реферальный бонус 3 (кап)
ok += 1
print('3) реферальный бонус: free(1) + кап 3 = 4 критерия')

# ── 4. Монеты: начисление и атомарное списание без минуса
assert cadd(1, 10, 'grant') == 10
assert cbal(1) == 10
assert cspend(1, 5, 'unlock') is True and cbal(1) == 5
assert cspend(1, 999, 'unlock') is False and cbal(1) == 5, 'баланс ушёл в минус'
assert cspend(1, 0, 'x') is False
ok += 1
print('4) монеты: начисление, списание атомарно, в минус не уходит')

# ── 5. «Критерий на сутки» — временный +1 слот
settings['criterion_day:1'] = (NOW + timedelta(hours=2)).isoformat()
assert crit_limit(1) == 4 + 1, crit_limit(1)
settings['criterion_day:1'] = (NOW - timedelta(hours=1)).isoformat()
assert crit_limit(1) == 4, crit_limit(1)
ok += 1
print('5) «критерий на сутки» даёт +1 слот, пока не истёк')

print('\nH: все проверки пройдены')
