"""Тарифы на мониторинг поисковых ссылок (модель Avito Hunter).

У Hunter: 1 ссылка 30 дней — 459 ₽, 2 — 729 ₽, 3 — 999 ₽, проверка
каждые 10 сек (Speed 2 сек дороже). Мы берём ниже рынка и честно говорим
про проверку раз в 5 минут.

Запуск: python3 tests/test_link_plans.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
PAY = open(os.path.join(ROOT, 'polka-final/frontend/proto/payments.js'), encoding='utf-8').read()

ok = 0
fail = 0


def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'ok   {name}')
    else:
        fail += 1
        print(f'FAIL {name} {extra}')


check('продукт 1 ссылка', "'link_1_30': (30, 'pay.rub_link1')" in SRC)
check('продукт 2 ссылки', "'link_2_30': (30, 'pay.rub_link2')" in SRC)
check('продукт 3 ссылки', "'link_3_30': (30, 'pay.rub_link3')" in SRC)
check('цена 1 ссылки 349 ₽', "'pay.rub_link1': ('str', None, None, '349'" in SRC)
check('цена 2 ссылок 599 ₽', "'pay.rub_link2': ('str', None, None, '599'" in SRC)
check('цена 3 ссылок 899 ₽', "'pay.rub_link3': ('str', None, None, '899'" in SRC)
check('ссылки дают слоты', "_LINK_SLOTS = {'link_1_30': 1" in SRC)
check('подтверждение про ссылки', 'Мониторинг ссылок подключён' in SRC)
check('группа в витрине', "'Мониторинг ссылок с Авито'" in PAY)
check('подписи ссылок', "'1 ссылка'" in PAY or "link_1_30: '1 ссылка'" in PAY)
check('проверка раз в 5 минут в описании', 'проверка раз в 5 минут' in PAY)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
