"""Локальная проверка paw_order_create без сети и без бота."""
import asyncio, hashlib, types, os, sys

src = open('polka_bot-9-3.py', encoding='utf-8').read()

def cut(name, stop=r'^(async )?def |^# ── '):
    start = f'async def {name}(' if f'async def {name}(' in src else f'def {name}('
    i = src.index(start)
    import re
    m = re.compile(stop, re.M).search(src, i + len(start))
    return src[i:(m.start() if m else len(src))]

# заглушки окружения
class Cur:
    def __init__(self): self.rows = []
    def execute(self, sql, args=()): self.rows.append((sql, args))
    def fetchone(self): return None
    def fetchall(self): return []
class Conn:
    def cursor(self): return Cur()
    def commit(self): pass
    def execute(self, *a): return Cur()

ns = {
    'asyncio': asyncio, 'hashlib': hashlib, 'os': os, 'Dict': dict, 'Any': object,
    'List': list, '_time': types.SimpleNamespace(time=lambda: 1700000000.0),
    '_up': types.SimpleNamespace(quote=lambda s: s),
    'db': types.SimpleNamespace(conn=Conn()),
    'logger': types.SimpleNamespace(warning=lambda *a, **k: None, info=lambda *a, **k: None),
    'get_moscow_time': lambda: types.SimpleNamespace(isoformat=lambda: '2026-10-24T01:00:00'),
    'CISPAY_PLANS': {'plus_30': (30, 'pay.rub_30'), 'plus_90': (90, 'pay.rub_90'), 'week': (7, 'pay.rub_week')},
    '_cispay_price': lambda k: {'pay.rub_30': 199.0, 'pay.rub_90': 478.0, 'pay.rub_week': 79.0}.get(k, 0.0),
    'paw_mnt_id': lambda: '12345678',
    'paw_test_mode': lambda: 1,
    'paw_secret': lambda: 'secret',
    'PAW_FORM_URL': 'https://www.payanyway.ru/assistant.htm',
    '_db_locked': lambda fn, *a, **k: fn(),
    '_plan_event': lambda *a, **k: None,
}
for name in ('_paw_sign', 'paw_order_create'):
    exec(cut(name), ns)

async def main():
    r = await ns['paw_order_create'](777, 'plus_30', 'https://example.app')
    print('результат:', {k: (v[:60] + '…' if isinstance(v, str) and len(v) > 60 else v) for k, v in r.items()})
    assert r['ok'], 'оплата не создалась'
    assert 'MNT_SIGNATURE=' in r['url'], 'нет подписи в ссылке'
    assert 'MNT_AMOUNT=199.00' in r['url'], 'неверная сумма'
    assert r['days'] == 30 and r['amount'] == 199

    bad = await ns['paw_order_create'](777, 'нет_такого', 'https://example.app')
    assert not bad['ok'] and bad['error'] == 'unknown_product'
    print('неизвестный продукт отклонён:', bad['error'])

    ns['_cispay_price'] = lambda k: 0.0
    noprice = await ns['paw_order_create'](777, 'plus_30', 'https://example.app')
    assert not noprice['ok'] and noprice['error'] == 'price_not_set'
    print('нет цены — отказ:', noprice['error'])
    print('\nPayAnyWay: создание счёта работает')

asyncio.run(main())
