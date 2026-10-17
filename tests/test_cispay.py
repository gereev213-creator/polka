"""Тесты оплаты картой через CISPay.

Самое опасное место — начисление «Плюса»: опрос идёт каждые 30 секунд, и
успешный статус придёт не один раз. Если начислять без защиты, человек
получит подписку многократно. Поэтому проверяем именно это:
  * оплата начисляется ровно один раз;
  * тестовый счёт не даёт настоящий «Плюс»;
  * чужой счёт не отдаётся (проверка владельца);
  * тариф без цены не показывается и не продаётся.

Запуск: python3 tests/test_cispay.py
"""
import asyncio
import os
import re
import sqlite3
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

TOKENS = ('CISPAY_PLANS', 'CISPAY_API', 'CISPAY_POLL_EVERY', 'CISPAY_ORDER_TTL_SEC',
          'CISPAY_WATCH_HOURS', 'ensure_payments', 'cispay_shop_uuid', 'cispay_enabled',
          '_cispay_price', 'cispay_call', 'cispay_plans_public', 'cispay_order_create',
          'cispay_order_sync')


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
    # функции оплаты объявлены как async def — их тоже надо уметь находить
    m = re.match(r'(?:class|(?:async\s+)?def)\s+([A-Za-z_][A-Za-z0-9_]*)', chunk[0])
    if m:
        return m.group(1)
    m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=', chunk[0])
    return m.group(1) if m else ''


conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row

SETTINGS = {'pay.enabled': '1', 'pay.cispay_shop_uuid': 'shop-uuid-test',
            'pay.rub_week': '69', 'pay.rub_month': '199', 'pay.rub_quarter': '499',
            'pay.allow_test': '0'}
GRANTS = []
CALLS = []


class FakeLog:
    def warning(self, *a, **k): pass
    def info(self, *a, **k): pass
    def error(self, *a, **k): pass


ns = {'os': os, 're': re, 'json': __import__('json'), 'sqlite3': sqlite3,
      'Any': Any, 'Dict': Dict, 'List': List, 'Optional': Optional,
      'logger': FakeLog(),
      'db': type('D', (), {'conn': conn})(),
      'cfg_get': lambda key, default='': SETTINGS.get(key, default),
      'get_moscow_time': lambda: datetime(2026, 10, 16, 23, 0, tzinfo=ZoneInfo('Europe/Moscow')),
      'timedelta': timedelta,
      '_plan_event': lambda uid, name, data=None: CALLS.append((name, data)),
      '_grant_plus_days': lambda uid, days: GRANTS.append((uid, days)) or '2026-12-16T00:00:00+03:00',
      '_db_read': lambda fn, *a: fn(*a),
      '_notify_payment_paid': lambda *a, **k: asyncio.sleep(0),
      'aiohttp_web': type('A', (), {}),
      'asyncio': asyncio,
      '_safe_isoparse': None}

picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS and n not in [p[0] for p in picked]:
        picked.append((n, '\n'.join(chunk)))
missing = [n for n in TOKENS if n not in [p[0] for p in picked]]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

# HTTP к провайдеру подменяем: проверяем логику, а не сеть
ANSWER = {'create': {'ok': True, 'data': {'status': 'success',
                                          'uuid': 'order-1',
                                          'url': 'https://acquire.cispay.pro/order-1'}},
          'info': {'ok': True, 'data': {'status': 'waiting', 'is_test': 0, 'amount': 199.0}}}


async def fake_call(path, payload):
    CALLS.append((path, payload))
    if path == '/payment/create':
        return ANSWER['create']
    return ANSWER['info']


ns['cispay_call'] = fake_call
ns['ensure_payments']()

# ── 1. Витрина: только тарифы с ценой
plans = ns['cispay_plans_public']()
assert [p['product'] for p in plans] == ['plus_week', 'plus_month', 'plus_quarter'], plans
assert plans[0]['amount'] == 69 and plans[0]['days'] == 7, plans
SETTINGS['pay.rub_quarter'] = '0'
assert [p['product'] for p in ns['cispay_plans_public']()] == ['plus_week', 'plus_month']
SETTINGS['pay.rub_quarter'] = '499'
print('1) витрина показывает только тарифы с заданной ценой')

# ── 2. Создание счёта: запись в базе, ссылка наружу
res = asyncio.run(ns['cispay_order_create'](777, 'plus_month'))
assert res.get('ok') and res['url'].startswith('https://') and res['days'] == 30, res
row = conn.execute("SELECT * FROM payments WHERE order_uuid='order-1'").fetchone()
assert row and row['status'] == 'waiting' and int(row['credited']) == 0, dict(row)
assert float(row['amount']) == 199.0, dict(row)
print('2) счёт создан, платёж записан как «ждёт оплаты»')

# ── 3. Ещё не оплачен — «Плюс» не начисляем
r = asyncio.run(ns['cispay_order_sync']('order-1', user_id=777))
assert r['status'] == 'waiting' and not r['credited'], r
assert GRANTS == [], GRANTS
print('3) счёт не оплачен — начисления нет')

# ── 4. Оплата: начисляем ровно один раз, даже если опрос повторится
ANSWER['info'] = {'ok': True, 'data': {'status': 'success', 'is_test': 0, 'amount': 199.0}}
r = asyncio.run(ns['cispay_order_sync']('order-1', user_id=777))
assert r['status'] == 'paid' and r['credited'] and GRANTS == [(777, 30)], (r, GRANTS)
r2 = asyncio.run(ns['cispay_order_sync']('order-1', user_id=777))
assert r2['status'] == 'paid' and GRANTS == [(777, 30)], 'начислили дважды!'
print('4) оплата начислена один раз, повторный опрос ничего не добавил')

# ── 5. Тестовый счёт не даёт настоящий «Плюс»
res = asyncio.run(ns['cispay_order_create'](778, 'plus_month'))
ANSWER['create'] = {'ok': True, 'data': {'status': 'success', 'uuid': 'order-test',
                                         'url': 'https://acquire.cispay.pro/order-test'}}
res = asyncio.run(ns['cispay_order_create'](778, 'plus_month'))
assert res['order_uuid'] == 'order-test', res
ANSWER['info'] = {'ok': True, 'data': {'status': 'success', 'is_test': 1, 'amount': 199.0}}
r = asyncio.run(ns['cispay_order_sync']('order-test', user_id=778))
assert r['status'] == 'test_paid' and not r['credited'], r
assert GRANTS == [(777, 30)], GRANTS
print('5) тестовый счёт не начисляет «Плюс»')

# ── 6. Чужой счёт не отдаём
r = asyncio.run(ns['cispay_order_sync']('order-1', user_id=999))
assert not r.get('ok') and r.get('error') == 'not_yours', r
print('6) чужой платёж по чужому запросу не отдаётся')

# ── 7. Без цены и без UUID ничего не продаётся
SETTINGS['pay.rub_month'] = '0'
r = asyncio.run(ns['cispay_order_create'](777, 'plus_month'))
assert not r.get('ok') and r.get('error') == 'price_not_set', r
SETTINGS['pay.rub_month'] = '199'
SETTINGS['pay.enabled'] = '0'
assert ns['cispay_enabled']() is False
SETTINGS['pay.enabled'] = '1'
assert ns['cispay_enabled']() is True
print('7) без цены не продаём; выключатель оплаты работает')

print('\nCISPay: все проверки пройдены')
