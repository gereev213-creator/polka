"""Тест сборщика: построение целей из критериев.

Этот тест появился не просто так: при переписывании `targets_from_criteria`
в логе осталась проверка переменной, которую я убрал, — сбор падал с
`UnboundLocalError: cannot access local variable 'skipped'`, и находки
перестали приходить. Обычные тесты сборщика проверяют разбор страниц и
поэтому крах не поймали. Здесь мы вызываем саму функцию построения целей
на подставном ответе сервера — без сети.

Запуск: python3 tests/test_collector_targets.py
"""
import importlib.util
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECT = os.path.join(HERE, '..', 'collector', 'collect.py')

spec = importlib.util.spec_from_file_location('collect', COLLECT)
collect = importlib.util.module_from_spec(spec)
sys.argv = ['collect.py', '--selftest']
spec.loader.exec_module(collect)

CRITERIA = {'items': [
    {'query': 'iPhone 13 Pro', 'category': 'Электроника', 'max_price': 30000, 'min_price': 0},
    {'query': 'зип кофта мальчика 158', 'category': '', 'max_price': 1500, 'min_price': 0},
    {'query': 'робот-пылесос', 'category': 'Бытовая техника', 'max_price': 15000, 'min_price': 0},
    {'query': '', 'category': '', 'max_price': 0, 'min_price': 0},
]}

calls = {'n': 0}


def fake_fetch_json(url, token, timeout=90):
    calls['n'] += 1
    return CRITERIA


collect.fetch_json = fake_fetch_json
targets = collect.targets_from_criteria('https://example.test', 'token')
assert calls['n'] == 1, calls
assert len(targets) == 3, f'целей {len(targets)}, ожидали 3 (без критерия с пустым текстом)'
print('1) построение целей не падает и даёт цель на каждый критерий с текстом')

by_query = {t['query']: t['url'] for t in targets}
assert by_query['iPhone 13 Pro'].startswith('https://www.avito.ru/all/telefony'), by_query
assert 'pmax=30000' in by_query['iPhone 13 Pro'], by_query['iPhone 13 Pro']
print('2) телефон ищется в разделе «телефоны» с пределом цены')

# дефис в слове: «робот-пылесос» должен найтись словом «пылесос»
assert 'bytovaya_tehnika' in by_query['робот-пылесос'], by_query['робот-пылесос']
print('3) слово с дефисом распознано («робот-пылесос» → бытовая техника)')

# критерий без узнаваемой категории не теряется: цель есть
assert 'зип кофта мальчика 158' in by_query, by_query
print('4) критерий без узнаваемого раздела не пропадает')

# пустой текст — не цель, и это не ошибка
assert '' not in by_query
print('5) критерий с пустым текстом пропускается молча')

print('\nсборщик: построение целей в порядке')
