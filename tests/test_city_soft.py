"""Мягкая проверка города: неизвестный город не отбрасывает лот.

Раньше сборщик не заполнял город, и критерии с городом отбрасывали
ПОЧТИ ВСЁ (например, поиск «Kayo tt140» у реального платящего клиента —
3013 отказов, ни одной находки). Теперь пустой город = «не проверено».

Запуск: python3 tests/test_city_soft.py
"""
import ast
import os
import sys
from typing import Dict

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


tree = ast.parse(SRC)
ns = {'Dict': Dict}
for node in tree.body:
    name = getattr(node, 'name', None)
    if isinstance(node, ast.FunctionDef) and name in ('_norm_city', '_cities_match'):
        exec(ast.get_source_segment(SRC, node), ns)
match = ns['_cities_match']
norm = ns['_norm_city']

check('город нормализуется', norm(' Санкт-Петербург ') == 'санкт-петербург')
check('пустой город не отбрасывает', match('Москва', '') is True)
check('тот же город', match('Москва', 'москва') is True)
check('регистр не важен', match('казань', 'Казань') is True)
check('«петербург» и «санкт-петербург»', match('Санкт-Петербург', 'Санкт-Петербург') is True and match('Петербург', 'Санкт-Петербург') is True)
check('разные города — отказ', match('Москва', 'Казань') is False)
check('город не указан у поиска', match('', 'Москва') is True)
check('проверка подключена в evaluate_ad', "_cities_match(_want_city" in SRC)
check('есть пересчёт после фикса', "action == 'recompute_crit'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
