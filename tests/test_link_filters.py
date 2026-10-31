"""Ссылка с фильтрами Авито: цена из f=, продавец, раздел.

Каждый тест из реальной поломки: человек вставляет ссылку с фильтрами,
а критерий создаётся без цены — в адресе нет pmin/pmax, обе границы лежат
внутри закодированного f=. Сборщик после этого тянул всю категорию.

Запуск: python3 tests/test_link_filters.py
"""
import ast
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

# Берём функцию и её модульные константы без импорта бота: импорт поднимает
# базу, телеграм-бота и сеть, а проверять нужно только чистую функцию.
_tree = ast.parse(SRC)
_fn = next(n for n in _tree.body
           if isinstance(n, ast.FunctionDef) and n.name == 'parse_avito_search_link')
_used = {n.id for n in ast.walk(_fn) if isinstance(n, ast.Name)}

_ns = {'__builtins__': __builtins__}
_module = {}
for _node in _tree.body:
    if isinstance(_node, (ast.Import, ast.ImportFrom)):
        try:
            exec(ast.get_source_segment(SRC, _node) or '', _ns)
        except Exception:
            # Часть импортов тянет бота и его окружение — для чистого
            # разбора ссылки они не нужны (там только re и urllib.parse).
            pass
    elif isinstance(_node, (ast.Assign, ast.AnnAssign)):
        _targets = _node.targets if isinstance(_node, ast.Assign) else [_node.target]
        for _t in _targets:
            if isinstance(_t, ast.Name):
                _module[_t.id] = ast.get_source_segment(SRC, _node)
for _name in _used & set(_module):
    exec(_module[_name], _ns)
exec(ast.get_source_segment(SRC, _fn), _ns)
parse = _ns['parse_avito_search_link']

fail = 0
ok = 0


def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'ok   {name}')
    else:
        fail += 1
        print(f'FAIL {name} {extra}')


# Реальная ссылка человека: MacBook из Москвы, только частные, до 50 000 ₽.
# Цена лежит не в pmin/pmax, а внутри f= — хвост декодируется в
# {"from":0,"to":50000}.
LINK = ('https://m.avito.ru/all/noutbuki/noutbuki/apple/do50-ASgBAgECAUSo5A302WYBRcaaDBV7ImZyb20iOjAsInRvIjo1MDAwMH0'
        '?f=ASgBAgECA0TwvA2I0jSg5A3Ot~sRqOQN9NlmAUXGmgwVeyJmcm9tIjowLCJ0byI6NTAwMDB9'
        '&geoCoords=55.755814%2C37.617635&user=1')
r = parse(LINK)
check('ссылка с фильтрами разобрана', r.get('ok') is True, r)
check('цена «до 50 000» достаётся из f=', r.get('max_price') == 50000, r.get('max_price'))
check('нижняя граница цены', r.get('min_price') == 0, r.get('min_price'))
check('только частные (user=1)', r.get('user') == '1', r.get('user'))
check('раздел из ссылки сохранён', str(r.get('path') or '').startswith('all/noutbuki'),
      r.get('path'))

# Ссылка без f= (человек просто ищет по словам) тоже принимается.
r2 = parse('https://www.avito.ru/izhevsk/telefony?q=iphone+13&pmin=20000&pmax=45000')
check('ссылка без f= разобрана', r2.get('ok') is True, r2)
check('цена из pmin/pmax', (r2.get('min_price'), r2.get('max_price')) == (20000, 45000), r2)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
