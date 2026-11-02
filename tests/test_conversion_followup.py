"""Дожим до подписки: тексты касаний, скидка −50%, ссылка с промокодом.

Принципы из статьи РБК «Дожим продаж»: несколько касаний, сегментация,
ценность, конкретика. Проверяем реальные функции (AST), не только строки.

Запуск: python3 tests/test_conversion_followup.py
"""
import ast
import html
import os
import sys
from typing import Any, Dict, List

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
ADP = open(os.path.join(ROOT, 'polka-final/frontend/proto/adapter.js'), encoding='utf-8').read()

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


tree = ast.parse(SRC)
ns = {'Dict': Dict, 'List': List, 'Any': Any, 'html': html,
      '_hunt_escape': lambda v: html.escape(str(v or '')),
      'CONV_PROMO_PERCENT': 50,
      '_miniapp_url': lambda: 'https://app.test'}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and getattr(node, 'name', None) in (
            '_conv_caption', '_conv_keyboard'):
        exec(ast.get_source_segment(SRC, node), ns)
cap = ns['_conv_caption']
kb = ns['_conv_keyboard']

# 1) первое касание: ценность + скидка + код
t1 = cap('first', 'айфон 13', 4, 'PLUS50-123', 149, 74)
check('первое касание: поиск остановлен', 'остановлен' in t1)
check('первое касание: сколько находок прислали', 'прислали <b>4</b>' in t1)
check('первое касание: что даёт Плюс', 'без суточного ограничения' in t1)
check('первое касание: скидка 50%', '−50%' in t1)
check('первое касание: цена со скидкой', '74 ₽' in t1 and '149 ₽' in t1)
check('первое касание: код виден', 'PLUS50-123' in t1)

# 2) без находок — честно
t2 = cap('first', 'rick owens', 0, 'PLUS50-9', 149, 74)
check('без находок: не врёт про находки', 'прислали' not in t2)
check('без находок: пишет про проверки', 'проверяли объявления' in t2)

# 3) последний шанс
t3 = cap('last', 'айфон 13', 4, 'PLUS50-123', 149, 74)
check('последний шанс: заголовок', 'Последний шанс' in t3)
check('последний шанс: срок 48 часов', '48 часов' in t3)

# 4) тем, кто не создал поиск — не про деньги
t4 = cap('nosearch', '', 0, '', 0, 0)
check('без поиска: не просит денег', '₽' not in t4)
check('без поиска: предлагает создать поиск', 'создайте первый поиск' in t4)

# 5) экранирование
t5 = cap('first', '<b>x</b>', 1, 'A&B', 149, 74)
check('запрос экранирован', '&lt;b&gt;x&lt;/b&gt;' in t5)
check('код экранирован', 'A&amp;B' in t5)

# 6) кнопки
k1 = kb('PLUS50-123', 'first')
urls = str(k1)
check('кнопка ведёт на тарифы', 'screen=tariffs' in urls)
check('промокод в ссылке', 'promo=PLUS50-123' in urls)
check('кнопка «Забрать −50%»', 'Забрать' in urls)
k2 = kb('', 'nosearch')
check('кнопка «Создать поиск»', 'screen=newsearch' in str(k2))

# 7) сквозные связи
check('есть выдача персонального промокода', 'def issue_personal_promo(' in SRC)
check('промокод действует 7 дней', 'CONV_PROMO_DAYS = 7' in SRC)
check('касание через сутки', 'CONV_STAGE1_HOURS = 24' in SRC)
check('последний шанс через трое суток', 'CONV_STAGE2_HOURS = 72' in SRC)
check('цикл дожима запускается', "create_task(_conversion_loop(" in SRC)
check('пометка касаний хранится', "'conv:'" in SRC or 'f\'conv:{' in SRC or 'conv:{int(user_id)}' in SRC)
check('есть предпросмотр conv_test', "action == 'conv_test'" in SRC)

# 8) клиент: скидка из ссылки видна в цене
check('клиент читает promo из ссылки', "get('promo')" in ADP)
check('клиент показывает цену со скидкой', 'function applyPromoPrice(' in ADP)
check('старая цена зачёркнута', '<s style=' in ADP)

# 9) лимит одноразового промокода реально проверяется
check('счётчик берётся из колонки uses', "promo.get('uses')" in SRC)
check('инкремент пишет в uses', 'SET uses=COALESCE(uses,0)+1' in SRC)
check('нет старой колонки в апдейте', 'current_uses=current_uses+1' not in SRC)
check('заблокированные не получают касания', 'if uid in blocked' in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
