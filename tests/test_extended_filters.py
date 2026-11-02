"""Расширенные фильтры по параметрам карточки.

Сборщик с ноутбука теперь приносит params_json (состояние, память, АКБ,
размер, год, пробег). Здесь проверяем, что сервер их читает и отсеивает
неподходящее, а в форме есть нужные чипы.

Запуск: python3 tests/test_extended_filters.py
"""
import ast
import html
import json
import os
import re
import sys
from typing import Any, Dict, List

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
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


# 1) реальные функции из модуля
tree = ast.parse(SRC)
ns = {'re': re, 'json': json, 'Dict': Dict, 'List': List, 'Any': Any}
for node in tree.body:
    name = getattr(node, 'name', None)
    if isinstance(node, ast.FunctionDef) and name in (
            '_ad_param', '_ad_number', '_ad_requirement_violation'):
        exec(ast.get_source_segment(SRC, node), ns)
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == '_AD_PARAM_KEYS':
                exec(ast.get_source_segment(SRC, node), ns)
param = ns['_ad_param']
num = ns['_ad_number']
viol = ns['_ad_requirement_violation']

ad = {'params_json': json.dumps({'Память': '128 ГБ', 'Год выпуска': '2014',
                                 'Пробег': '180 000 км', 'Состояние': 'Хорошее'},
                                ensure_ascii=False),
      'size': '52', 'title': 'iPhone 15 Pro'}
check('память читается из параметров', param(ad, 'memory') == '128 ГБ')
check('год читается', param(ad, 'year') == '2014')
check('пробег читается', num(param(ad, 'mileage')) == 180000)
check('число из «128 ГБ»', num('128 ГБ') == 128)

check('память ниже требуемой — отказ',
      viol(ad, {'memory_min': 256}) == 'memory_low')
check('память подходит', viol(ad, {'memory_min': 128}) == '')
check('старый год — отказ', viol(ad, {'year_min': 2015}) == 'year_old')
check('пробег больше — отказ', viol(ad, {'mileage_max': 100000}) == 'mileage_high')
check('размер не тот — отказ', viol(ad, {'size': '48'}) == 'size_mismatch')
check('размер тот', viol(ad, {'size': '52'}) == '')
check('без параметров не врёт', viol({'params_json': ''}, {'memory_min': 256}) == '')

# 2) разбор требований из формы
check('память от 256 разбирается', "req_json['memory_min']" in SRC)
check('год от 2015 разбирается', "req_json['year_min']" in SRC)
check('пробег до 100000 разбирается', "req_json['mileage_max']" in SRC)
check('размер разбирается', "req_json['size']" in SRC)
check('проверка подключена в evaluate_ad', "_ad_requirement_violation(ad, rj)" in SRC)

# 3) чипы в форме
for label in ('Оригинал', 'Не вскрывался', 'Полный комплект',
              'Память от 256', 'Год от 2015', 'Пробег до 100 000'):
    check(f'чип «{label}» в форме', label in TPL and label in IDX)

# 4) состояние и размер сохраняются из параметров
check('состояние пишется в ads.condition', 'condition=COALESCE(NULLIF(' in SRC)
check('размер пишется в ads.size', 'size=COALESCE(NULLIF(' in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
