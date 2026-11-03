"""Микро-покупки: 19 ₽ за поиск, 49 ₽ за 5, 99 ₽ за 30 дней.

Владелец предложил проверить три цены вместо подписки за 149 ₽: человек,
который упёрся в лимит одного бесплатного поиска, охотнее купит дешёвый
пакет, чем подписку.

Запуск: python3 tests/test_pricing_packs.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
PAY = open(os.path.join(ROOT, 'polka-final/frontend/proto/payments.js'), encoding='utf-8').read()
TPL = open(os.path.join(ROOT, 'polka-final/frontend/proto/template.html'), encoding='utf-8').read()
IDX = open(os.path.join(ROOT, 'polka-final/frontend/proto/index.html'), encoding='utf-8').read()

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


# 1) продукты и цены
check('продукт +1 поиск', "'extra_search': (30, 'pay.rub_extra')" in SRC)
check('продукт пакет 5', "'pack_5': (30, 'pay.rub_pack5')" in SRC)
check('продукт 30 дней без лимита', "'unlimited_30': (30, 'pay.rub_unlimited')" in SRC)
check('цена 19 ₽', "'pay.rub_extra': ('str', None, None, '19'" in SRC)
check('цена 49 ₽', "'pay.rub_pack5': ('str', None, None, '49'" in SRC)
check('цена 99 ₽', "'pay.rub_unlimited': ('str', None, None, '99'" in SRC)

# 2) учёт купленных поисков
check('таблица докупленных поисков', 'CREATE TABLE IF NOT EXISTS slot_purchases' in SRC)
check('таблица создаётся при старте', 'ensure_slot_purchases()' in SRC)
check('лимит учитывает купленные', 'bonus += _purchased_slots' in SRC)
check('срок купленных — 30 дней', 'timedelta(days=30)' in SRC)

# 3) начисление после оплаты
check('оплата слотов обрабатывается', "if product in ('extra_search', 'pack_5'):" in SRC)
check('+1 за extra_search', "slots = 1 if product == 'extra_search' else 5" in SRC)
check('событие slots_paid', "'slots_paid'" in SRC)
check('пользователю приходит подтверждение', 'Поиски добавлены' in SRC)

# 4) витрина: три оффера, A/B по умолчанию
check('клиент показывает три оффера', "VISIBLE_PRODUCTS = ['extra_search', 'pack_5', 'unlimited_30']" in PAY)
check('подпись «Ещё 1 поиск»', "'Ещё 1 поиск'" in PAY)
check('подпись «5 поисков»', "'5 поисков'" in PAY)
check('подпись «30 дней без лимита»', "'30 дней без лимита'" in PAY)
check('A/B ведёт на новые офферы', "_default_product = 'extra_search' if _bucket == 0" in SRC)
check('подсказка в тарифах', 'Дополнительные поиски — от 19 ₽' in TPL)
check('подсказка на проде', 'Дополнительные поиски — от 19 ₽' in IDX)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
