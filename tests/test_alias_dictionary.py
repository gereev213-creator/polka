"""Словарь ru→en для поиска: «айфон» находит «iPhone».

Данные — data/ru_en_aliases.json (Wikidata CC0 + ручные пары), генератор —
tools/build_aliases.py. Здесь проверяем реальные функции из модуля: скелет,
индекс и раскрытие запроса.

Запуск: python3 tests/test_alias_dictionary.py
"""
import ast
import json
import os
import sys
from typing import Any, Dict, List

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
DATA = json.load(open(os.path.join(ROOT, 'data/ru_en_aliases.json'), encoding='utf-8'))

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


# 1) данные на месте и большие
pairs = DATA.get('pairs') or {}
en_terms = DATA.get('en_terms') or []
check('словарь пар не меньше 1000', len(pairs) >= 1000, f'({len(pairs)})')
check('латинских названий не меньше 1000', len(en_terms) >= 1000, f'({len(en_terms)})')
check('лицензия CC0 указана', DATA.get('license') == 'CC0')
check('источник указан', 'Wikidata' in str(DATA.get('source') or ''))
check('генератор в репозитории', os.path.isfile(os.path.join(ROOT, 'tools/build_aliases.py')))

# 2) функции из модуля
tree = ast.parse(SRC)
ns = {'Dict': Dict, 'List': List, 'Any': Any}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and getattr(node, 'name', None) in (
            '_alias_skel', '_alias_build_index', '_alias_expand'):
        exec(ast.get_source_segment(SRC, node), ns)
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == '_RU2LAT':
                exec(ast.get_source_segment(SRC, node), ns)
skel = ns['_alias_skel']
build = ns['_alias_build_index']
expand = ns['_alias_expand']
phon = build(pairs, en_terms)

check('скелет «айфон» = iphone', skel('айфон') == skel('iPhone'))
check('скелет «самсунг» = samsung', skel('самсунг') == skel('samsung'))
check('скелет «гуччи» = gucci', skel('гуччи') == skel('gucci'))

exp = expand('айфон', pairs, phon)
check('«айфон» раскрывается в iphone', 'iphone' in exp, str(exp))
exp2 = expand('айфон 13', pairs, phon)
check('«айфон 13» → iphone 13', any('iphone' in v and '13' in v for v in exp2), str(exp2))
exp3 = expand('самсунг', pairs, phon)
check('«самсунг» → samsung', 'samsung' in exp3, str(exp3))
exp4 = expand('гуччи', pairs, phon)
check('«гуччи» → gucci', 'gucci' in exp4, str(exp4))
exp5 = expand('нитендо', pairs, phon)
check('«нитендо» → nintendo по фонетике', 'nintendo' in exp5, str(exp5))
exp6 = expand('канада гус', pairs, phon)
check('«канада гус» → canada goose', any('canada goose' in v for v in exp6), str(exp6))
check('обычный запрос не трогаем', expand('куртка зимняя мужская', pairs, phon) == [])
check('пустой запрос', expand('', pairs, phon) == [])
check('не больше трёх вариантов', len(expand('найк адидас пума рибок', pairs, phon)) <= 3)

# 3) подключение к примерам
check('примеры используют словарь', '_alias_expand_cached(q)' in SRC)
check('поиск идёт по всем вариантам', 'terms += _alias_expand_cached(q)' in SRC)
check('загрузка из data/', "'data', 'ru_en_aliases.json'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
