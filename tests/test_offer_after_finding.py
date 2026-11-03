"""Оффер после первой находки: «3 поиска за 29 ₽».

Человек только что увидел находку — это момент максимальной готовности
платить. Раньше оффер жил только на экране тарифов.

Запуск: python3 tests/test_offer_after_finding.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()

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


check('есть функция оффера', 'async def _maybe_offer_pack(' in SRC)
check('только бесплатным', "!= 'free'" in SRC)
check('не повторяется', "offer29:" in SRC)
check('после 1–3 находок', 'if n < 1 or n > 3:' in SRC)
check('текст про 29 ₽', '3 поиска за 29 ₽' in SRC)
check('кнопка «Остаться на бесплатном»', 'offer29_skip' in SRC)
check('обработчик кнопки зарегистрирован',
      'CallbackQueryHandler(offer29_skip' in SRC)
check('вызывается после отправки находки',
      'asyncio.create_task(_maybe_offer_pack(app, user_id))' in SRC)
check('событие для аналитики', "'offer29_shown'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
