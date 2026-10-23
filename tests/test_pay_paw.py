"""PayAnyWay: подпись, разбор уведомления и защита от подделки.

Проверяем НАСТОЯЩИЕ функции из polka_bot-9-3.py: вырезаем их из файла и
исполняем в тестовом окружении (бота целиком не поднимаем).
"""
import hashlib
import hmac
import os
import re
import sys

BOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

SECRET = 'test-secret-123'


def cut(name, stop=r'^(async )?def |^# ── '):
    start = f'def {name}(' if f'def {name}(' in SRC else f'async def {name}('
    i = SRC.index(start)
    m = re.compile(stop, re.M).search(SRC, i + len(start))
    return SRC[i:m.start() if m else len(SRC)]


ns = {'hashlib': hashlib, 'hmac': hmac, 'Dict': dict, 'Any': object,
      'cfg_get': lambda k, d=None: {'pay.paw_secret': SECRET}.get(k, d),
      'logger': type('L', (), {'warning': staticmethod(lambda *a, **k: None),
                               'info': staticmethod(lambda *a, **k: None)})()}

exec(cut('paw_secret'), ns)
exec(cut('_paw_sign'), ns)
exec(cut('_paw_check_sign'), ns)

checks = []

# 1. Подпись воспроизводима и зависит от секрета
sig = ns['_paw_sign'](MNT_ID='123', MNT_TRANSACTION_ID='paw-1-2',
                      MNT_AMOUNT='149.00', MNT_CURRENCY_CODE='RUB', MNT_TEST_MODE='1')
raw = '123' + 'paw-1-2' + '149.00' + 'RUB' + '1' + SECRET
expected = hashlib.md5(raw.encode()).hexdigest()
checks.append(('подпись считается по MNT-полям и секрету', sig == expected))
checks.append(('подпись — 32 символа hex', len(sig) == 32 and all(c in '0123456789abcdef' for c in sig)))

# 2. Смена суммы меняет подпись — иначе можно подделать цену
sig2 = ns['_paw_sign'](MNT_ID='123', MNT_TRANSACTION_ID='paw-1-2',
                       MNT_AMOUNT='1.00', MNT_CURRENCY_CODE='RUB', MNT_TEST_MODE='1')
checks.append(('подмена суммы ломает подпись', sig2 != sig))

# 3. Проверка уведомления: верная подпись проходит, неверная — нет
good = {'MNT_ID': '123', 'MNT_TRANSACTION_ID': 'paw-1-2', 'MNT_AMOUNT': '149.00',
        'MNT_CURRENCY_CODE': 'RUB', 'MNT_TEST_MODE': '1', 'MNT_SIGNATURE': sig}
checks.append(('верная подпись принимается', ns['_paw_check_sign'](good) is True))

# Портим первый символ гарантированно: replace('a','b') ничего не менял,
# если буквы «a» в подписи не было, и тест падал на исправном коде.
tampered = ('0' if sig[0] != '0' else '1') + sig[1:]
bad = dict(good, MNT_SIGNATURE=tampered)
checks.append(('поддельная подпись отклоняется', ns['_paw_check_sign'](bad) is False))

empty = dict(good)
empty.pop('MNT_SIGNATURE')
checks.append(('уведомление без подписи отклоняется', ns['_paw_check_sign'](empty) is False))

# 4. Требуемые маршруты объявлены
for route in ('/api/pay/paw/create', '/api/pay/paw/status', '/api/pay/paw/notify'):
    checks.append((f'маршрут {route} объявлен', route in SRC))
checks.append(('ответ SUCCESS зашит в notify', "'SUCCESS'" in SRC))

ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res

print('\nPayAnyWay: все проверки пройдены' if ok else '\nPayAnyWay: есть ошибки')
sys.exit(0 if ok else 1)
