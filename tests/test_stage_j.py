"""Тесты этапа J: настройки без релиза, админ-доступ, промокоды.

Проверяем:
 1. Настройки: диапазон, мгновенный кэш, история, откат.
 2. План и лимиты читаются из настроек (админ меняет — меняется поведение).
 3. Подписка с истечением: кончилась — «Плюс» снимается, лишние критерии на паузе.
 4. Промокоды: монеты, дни «Плюса», слот, пробный; повтор/лимит/срок/выключение.

Запуск: python3 tests/test_stage_j.py
"""
import json
import os
import re
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = (
    'SETTINGS_SCHEMA', '_SETTINGS_CACHE', '_SETTINGS_LOADED', 'ensure_admin',
    '_settings_load', 'cfg_get',
    '_cfg_coerce', 'cfg_set', 'cfg_history', 'cfg_rollback', 'cfg_public',
    'cfg_ab_free_limit', '_cfg_ab_bucket', 'ensure_promo', 'promo_create', 'promo_list',
    'promo_deactivate', 'promo_redeem', '_grant_plus_days', 'PROMO_KINDS', 'PROMO_KIND_TITLES',
    'ensure_monetization', '_user_plan', '_plus_subscription', '_criteria_limit',
    '_referral_criteria_bonus', '_pause_extra_criteria', 'coins_balance', 'coins_add',
    'coins_spend', '_plan_event', '_hours_since', '_safe_isoparse',
    'PLAN_FREE_MAX_CRITERIA', 'PLAN_FREE_DELAY_MIN', 'PLAN_TRIAL_DAYS', 'PLAN_TRIAL_MAX_CRITERIA',
    'PLAN_PLUS_MAX_CRITERIA', 'PLAN_PLUS_PRICE', 'PLAN_PLUS_SHOW_PRICE', 'PLAN_REF_MAX_BONUS',
    'COIN_UNLOCK_PRICE', 'COIN_DEEP_CHECK_PRICE', 'COIN_CRITERION_DAY_PRICE', 'PLUS_STARS',
    'HUNT_MIN_DISCOUNT', 'HUNT_DIGEST_AFTER', 'HUNT_FRESH_HOURS', 'HUNT_MIN_PRICE_SHARE',
)


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


NOW = [datetime(2026, 10, 14, 12, 0, 0, tzinfo=ZoneInfo('Europe/Moscow'))]
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.executescript('''
    CREATE TABLE users (user_id INTEGER PRIMARY KEY, plan TEXT DEFAULT '',
        trial_started_at TEXT, registration_date TEXT, username TEXT);
    CREATE TABLE hunt_criteria (id INTEGER PRIMARY KEY, user_id INTEGER, active INTEGER DEFAULT 1,
        paused_reason TEXT);
    CREATE TABLE referrals (referrer_id INTEGER, referred_id INTEGER PRIMARY KEY);
    CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
        plan TEXT, started_at TEXT, expires_at TEXT);
    CREATE TABLE coin_wallets (user_id INTEGER PRIMARY KEY, balance INTEGER DEFAULT 0);
    CREATE TABLE coin_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
        delta INTEGER, reason TEXT, created_at TEXT);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT,
        data TEXT, created_at TEXT);
    CREATE TABLE hunt_matches (id INTEGER PRIMARY KEY, user_id INTEGER, ad_id INTEGER);
    CREATE TABLE ads (id INTEGER PRIMARY KEY, source TEXT, title TEXT, price INTEGER,
        city TEXT, category TEXT, parsed_at TEXT, discount_percent INTEGER, status TEXT);
''')


class FakeDb:
    def __init__(self, c):
        self.conn = c
    def get_user(self, uid):
        r = self.conn.execute("SELECT * FROM users WHERE user_id=?", (int(uid),)).fetchone()
        return dict(r) if r else None
    def update_user(self, uid, **kw):
        cols = ", ".join(f"{k}=?" for k in kw)
        self.conn.execute(f"UPDATE users SET {cols} WHERE user_id=?", (*kw.values(), int(uid)))
        self.conn.commit()


class FakeLog:
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass
    def info(self, *a, **k): pass


settings = {}
ns = {'COINS_ENABLED': True, 'os': os, 'json': json, 're': re, 'sqlite3': sqlite3, 'Dict': Dict, 'List': List,
      'Optional': Optional, 'Tuple': Tuple, 'Any': Any, 'datetime': datetime,
      'timedelta': timedelta, 'ZoneInfo': ZoneInfo, 'db': FakeDb(conn), 'logger': FakeLog(),
      'get_moscow_time': lambda: NOW[0], '_time': __import__('time'),
      '_setting_get': lambda k, d='': settings.get(k, d),
      '_setting_set': lambda k, v: settings.__setitem__(k, v)}

picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS and n not in [p[0] for p in picked]:
        picked.append((n, '\n'.join(chunk)))
missing = [n for n in TOKENS if n not in [p[0] for p in picked]]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

ns['ensure_admin']()
ns['ensure_promo']()
ns['ensure_monetization']()
cfg_get, cfg_set = ns['cfg_get'], ns['cfg_set']
cfg_history, cfg_rollback = ns['cfg_history'], ns['cfg_rollback']
user_plan, crit_limit = ns['_user_plan'], ns['_criteria_limit']
promo_create, promo_redeem = ns['promo_create'], ns['promo_redeem']
coins_balance = ns['coins_balance']

conn.execute("INSERT INTO users (user_id, registration_date, username) VALUES (1, ?, 'tester')",
             (NOW[0].isoformat(),))
conn.commit()
ok = 0

# ── 1. Настройки: диапазон, кэш без перезапуска, история, откат
assert cfg_get('free.max_criteria') == 1, cfg_get('free.max_criteria')
assert cfg_set('free.max_criteria', 3, by=1)['ok'] is True
assert cfg_get('free.max_criteria') == 3, 'кэш не обновился без перезапуска'
bad = cfg_set('free.max_criteria', 9999, by=1)
assert bad['ok'] is False and bad['error'] == 'too_high', bad
assert cfg_set('нет.такого', 1)['error'] == 'unknown_key'
assert cfg_set('free.max_criteria', 'не число')['error'] == 'bad_type'
hist = cfg_history('free.max_criteria')
assert hist and json.loads(hist[0]['old_json']) == 1, hist[:1]
assert cfg_set('free.max_criteria', 4, by=1, reason='тест')['ok']
rb = cfg_rollback('free.max_criteria', by=1)
assert rb['ok'] and cfg_get('free.max_criteria') == 3, (rb, cfg_get('free.max_criteria'))
ok += 1
print('1) настройки: диапазон, мгновенный кэш, история и откат работают')

# ── 2. Лимит критериев из настроек + A/B
cfg_set('free.max_criteria', 2, by=1)
conn.execute("UPDATE users SET plan='free', trial_started_at=NULL WHERE user_id=1")
conn.commit()
assert crit_limit(1) == 2, crit_limit(1)
cfg_set('ab.free_max_criteria', 7, by=1)
cfg_set('ab.share_percent', 100, by=1)          # все в альтернативной группе
assert crit_limit(1) == 7, crit_limit(1)
cfg_set('ab.share_percent', 0, by=1)            # A/B выключен
assert crit_limit(1) == 2, crit_limit(1)
ok += 1
print('2) лимит критериев берётся из настроек, A/B-группа работает')

# ── 3. Пробный период из настроек
cfg_set('trial.days', 3, by=1)
conn.execute("UPDATE users SET plan='trial', trial_started_at=? WHERE user_id=1",
             ((NOW[0] - timedelta(days=1)).isoformat(),))
conn.commit()
p = user_plan(1)
assert p['name'] == 'trial' and p['trial_days_left'] == 2, p
cfg_set('trial.days', 1, by=1)
p = user_plan(1)
assert p['name'] == 'free' and p['criteria_limit'] == 2, p
ok += 1
print('3) срок пробного периода — из настроек, по истечении план сбрасывается')

# ── 4. Подписка с истечением
conn.execute("INSERT INTO subscriptions (user_id, plan, started_at, expires_at) "
             "VALUES (1,'plus',?,?)", ((NOW[0] - timedelta(days=40)).isoformat(),
                                       (NOW[0] - timedelta(days=10)).isoformat()))
conn.execute("UPDATE users SET plan='plus' WHERE user_id=1")
for i in range(6):
    conn.execute("INSERT INTO hunt_criteria (user_id, active) VALUES (1, 1)")
conn.commit()
p = user_plan(1)
assert p['name'] == 'free', p
paused = conn.execute("SELECT COUNT(*) AS n FROM hunt_criteria WHERE user_id=1 "
                      "AND active=0").fetchone()['n']
assert paused == 4, paused        # лимит free = 2, остальные 4 на паузе
ok += 1
print('4) просроченная подписка: «Плюс» снят, лишние критерии приостановлены')

# ── 5. Промокоды
r = promo_create('ПОЛКА100', 'coins', 100, max_uses=2, by=1)
assert r['ok'] and r['code'] == 'ПОЛКА100', r
assert promo_create('ПОЛКА100', 'coins', 50)['error'] == 'exists'
assert promo_create('AB', 'coins', 5)['error'] == 'short_code'
assert promo_create('BADKIND', 'нет', 5)['error'] == 'bad_kind'
res = promo_redeem(1, 'полка100')                 # регистр не важен
assert res['ok'] and res['granted'] == '100 монет', res
assert coins_balance(1) == 100, coins_balance(1)
again = promo_redeem(1, 'ПОЛКА100')
assert again['ok'] is False and again['error'] == 'already_used', again
assert promo_redeem(2, 'ПОЛКА100')['ok'] is True  # второй человек — можно (max_uses=2)
third = promo_redeem(3, 'ПОЛКА100')
assert third['ok'] is False and third['error'] == 'used_up', third
assert promo_redeem(3, 'НЕТТАКОГО')['error'] == 'not_found'
ok += 1
print('5) промокод на монеты: выдача, повтор, лимит использований')

# ── 6. Промокод на дни «Плюса»
r = promo_create('PLUS30', 'plus_days', 30, by=1)
res = promo_redeem(1, 'PLUS30')
assert res['ok'], res
p = user_plan(1)
assert p['name'] == 'plus' and p['criteria_limit'] == 10, p
exp = conn.execute("SELECT expires_at FROM subscriptions WHERE user_id=1 "
                   "ORDER BY id DESC LIMIT 1").fetchone()['expires_at']
assert exp > NOW[0].isoformat(), exp
# продление поверх действующей подписки — срок прибавляется
promo_create('PLUS7', 'plus_days', 7, by=1)
promo_redeem(1, 'PLUS7')
exp2 = conn.execute("SELECT expires_at FROM subscriptions WHERE user_id=1 "
                    "ORDER BY id DESC LIMIT 1").fetchone()['expires_at']
assert exp2 > exp, (exp, exp2)
ok += 1
print('6) промокод на «Плюс»: подписка выдана и продлевается, а не заменяется')

# ── 7. Промокод на слот и на пробный период
promo_create('SLOT3', 'criterion_days', 3, by=1)
assert promo_redeem(1, 'SLOT3')['ok']
assert settings.get('criterion_day:1', '') > NOW[0].isoformat()
assert crit_limit(1) == 11, crit_limit(1)     # 10 (плюс) + 1 слот
conn.execute("UPDATE users SET plan='free', trial_started_at=? WHERE user_id=3",
             ((NOW[0] - timedelta(days=30)).isoformat(),))
conn.commit()
promo_create('TRIAL7', 'trial_days', 7, by=1)
assert promo_redeem(3, 'TRIAL7')['ok']
assert user_plan(3)['name'] == 'trial', user_plan(3)
ok += 1
print('7) промокоды на слот и на пробный период активируются')

# ── 8. Выключенный и просроченный промокод
promo_create('OFF1', 'coins', 10, by=1)
ns['promo_deactivate']('OFF1', by=1)
res = promo_redeem(1, 'OFF1')
assert res['ok'] is False and res['error'] == 'inactive', res
promo_create('OLD1', 'coins', 10, expires_at=(NOW[0] - timedelta(days=1)).isoformat(), by=1)
res = promo_redeem(1, 'OLD1')
assert res['ok'] is False and res['error'] == 'expired', res
ok += 1
print('8) выключенный и просроченный промокоды не срабатывают')

print('\nJ: все проверки пройдены')
