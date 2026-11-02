"""Фильтры под категорию, описание барахолки и вид на ПК.

Проблемы от владельца:
1) на ПК мини-апп открывается во всё окно;
2) внизу формы висели все фильтры сразу — «рандомные»;
3) в карточке товара из барахолки написано «Описание на Авито».

Запуск: python3 tests/test_ui_dynamic_filters.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
ADP = open(os.path.join(ROOT, 'polka-final/frontend/proto/adapter.js'), encoding='utf-8').read()
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


# 1) динамические фильтры
check('есть контейнер динамических фильтров', 'id="dynFilters"' in TPL and 'dynFilters' in IDX)
check('статические блоки убраны', 'Батарея (для техники)' not in TPL)
check('есть наборы по категориям', 'FILTER_SETS' in ADP)
check('определение категории по запросу', 'function detectCategory(' in ADP)
check('рендер фильтров', 'function renderDynamicFilters(' in ADP)
check('техника: АКБ и память', "'Память от 256'" in ADP and "'АКБ от 85%'" in ADP)
check('авто: год и пробег', "'Год от 2015'" in ADP and "'Пробег до 100 000'" in ADP)
check('одежда: размер', 'size: true' in ADP and 'id="sizeInput"' in TPL)
check('размер уходит в критерий', "chips.push('размер ' + sizeVal)" in ADP)

# 2) описание в карточке: барахолка — не Авито
check('определяется источник объявления', "_board = _src === 'polka'" in ADP)
check('для барахолки «Описание не добавлено»', 'Описание не добавлено' in ADP)
check('для Авито текст остаётся', 'Описание на Авито — откройте объявление' in ADP)

# 3) вид на ПК: телефонная колонка на фоне
check('десктопный фон', 'radial-gradient(1200px 600px' in TPL)
check('колонка 440px', 'width:440px!important' in TPL)
check('тень рамки', '#wrap{position:relative!important;inset:auto!important;width:440px' in TPL)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
