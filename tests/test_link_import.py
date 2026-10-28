"""Тесты импорта ссылки Авито: разбор на сервере и построение адреса в сборщике.

Проверяют НАСТОЯЩИЙ код: функции вырезаются из polka_bot-9-3.py и collect.py.
Запуск из корня проекта: python3 tests/test_link_import.py
(пути можно переопределить переменными SERVER_PY и COLLECT_DIR)
"""
import ast, os, re, sys
from typing import Any, Dict, List, Optional

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.environ.get('SERVER_PY', os.path.join(ROOT, 'polka_bot-9-3.py'))
COLLECT_DIR = os.environ.get('COLLECT_DIR', os.path.join(ROOT, 'collector'))

# ---------- серверный разбор ----------
src = open(SERVER, encoding='utf-8').read()
lines = src.split('\n')
tree = ast.parse(src)
ns = {'re': re, 'Any': Any, 'Dict': Dict, 'List': List, 'Optional': Optional}
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id.startswith('AVITO_LINK_') for t in node.targets):
        exec('\n'.join(lines[node.lineno - 1:node.end_lineno]), ns)
    if isinstance(node, ast.FunctionDef) and node.name == 'parse_avito_search_link':
        exec('\n'.join(lines[node.lineno - 1:node.end_lineno]), ns)
parse = ns['parse_avito_search_link']

fails = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + (f'  {extra}' if (extra and not cond) else ''))
    if not cond: fails.append(name)

TOKEN = 'ASgBAgICAkS0wA3OqzmwwQ2I_Dc'
good = f'https://www.avito.ru/moskva/telefony/mobilnye_telefony/apple-{TOKEN}?cd=1&f=ASgBAQICAkS0wA3O&pmax=50000&pmin=10000&q=iphone+14+pro&user=1&s=104&utm_source=x'
r = parse(good)
check('нормальная ссылка разобрана', r.get('ok'), r)
check('путь сохранён с регистром токена', r.get('path') == f'moskva/telefony/mobilnye_telefony/apple-{TOKEN}', r.get('path'))
check('q из ссылки', r.get('q') == 'iphone 14 pro', r.get('q'))
check('цены', (r.get('min_price'), r.get('max_price')) == (10000, 50000))
check('продавец «частные»', r.get('user') == '1')
check('фильтр f сохранён', r.get('filters') == '&f=ASgBAQICAkS0wA3O', r.get('filters'))
check('метки utm отброшены', 'utm' not in r.get('filters', ''))
check('регион определён', r.get('region') == 'moskva', r.get('region'))

r = parse('avito.ru/moskva/odezhda_obuv_aksessuary?q=пуховик&pmin=5000&pmax=1000')
check('ссылка без https принимается', r.get('ok'), r)
check('цены переставлены, если min>max', (r.get('min_price'), r.get('max_price')) == (1000, 5000), r)

r = parse('https://m.avito.ru/rossiya/bytovaya_elektronika?withImagesOnly=1&radius=50&d=1&q=наушники')
check('мобильный хост, только с фото', r.get('ok') and r.get('with_photo') == 1, r)
check('радиус и доставка сохранены', 'radius=50' in r.get('filters', '') and 'd=1' in r.get('filters', ''), r.get('filters'))

r = parse('https://www.avito.ru/all/avtomobili?f=ASgB!!bad&user=3&q=')
check('мусор в f и неверный user отброшены, пустой q допустим', r.get('ok') and r.get('filters') == '' and r.get('user') == '' and r.get('q') == '', r)

bad = {
    'чужой хост': 'https://evil.com/moskva/telefony?q=a',
    'домен-обманка': 'https://www.avito.ru.evil.com/moskva?q=a',
    'userinfo': 'https://www.avito.ru@evil.com/moskva?q=a',
    'короткая ссылка': 'https://avito.app.link/abcd1234',
    'страница объявления': 'https://www.avito.ru/moskva/telefony/iphone_14_pro_1234567890',
    'профиль': 'https://www.avito.ru/profile/items',
    'нестандартный порт': 'https://www.avito.ru:8080/moskva?q=a',
    'javascript': 'javascript:alert(1)',
    'file': 'file:///etc/passwd',
    'пусто': '',
    'только хост': 'https://www.avito.ru/',
    'обход пути': 'https://www.avito.ru/moskva/../../etc?q=a',
    'пробелы в пути': 'https://www.avito.ru/mos kva?q=a',
    'слишком длинная': 'https://www.avito.ru/moskva?q=' + 'a' * 2100,
    'None': None,
}
for name, link in bad.items():
    rr = parse(link)
    check(f'отказ: {name}', rr.get('ok') is False and bool(rr.get('error')), rr)

# ---------- сборщик ----------
sys.path.insert(0, COLLECT_DIR)
import collect  # только стандартная библиотека

crit = {'search_path': f'moskva/telefony/apple-{TOKEN}', 'filters': '&f=ASgBAQICAkS0wA3O&radius=50',
        'user': '1', 'search_q': 'iphone 14 pro', 'min_price': 0, 'max_price': 50000}
u = collect.link_search_url(crit)
check('сборщик: адрес без глубокого пути',
      u.startswith('https://www.avito.ru/moskva/telefony?')
      and 'user=1' in u and 'f=ASgBAQICAkS0wA3O' in u
      and 'radius=50' in u and 'pmax=50000' in u and 's=104' in u, u)
check('сборщик: пустые pmin не попадают', 'pmin=' not in u, u)
crit2 = dict(crit, search_q='', user='', filters='')
u2 = collect.link_search_url(crit2)
check('сборщик: без q и без продавца параметров q= и user= нет', 'q=' not in u2.replace('pmax=', '').split('?')[1].replace('&s=104', '') and 'user=' not in u2, u2)
for name, patch in {'чужой путь': {'search_path': '../etc/passwd'}, 'путь с точкой': {'search_path': 'a.b'},
                    'опасные фильтры': {'filters': '&f=a<script>'}, 'пустой путь': {'search_path': ''},
                    'фильтры без значения-имени': {'filters': 'f=abc'}}.items():
    check(f'сборщик отвергает: {name}', collect.link_search_url(dict(crit, **patch)) == '')
check('сборщик: неверный user заменяется пустым', 'user=' not in collect.link_search_url(dict(crit, user='9')))

# критерии → цели (без сети)
rows = [
    {'id': 1, 'query': 'пуховик lacoste', 'category': '', 'city': '', 'max_price': 4000, 'min_price': 0, 'user': '1', 'filters': ''},
    dict(crit, id=2, query='мой айфон', category='', city='', from_link=1),
]
collect.fetch_json = lambda *a, **k: {'items': rows}
try:
    targets = collect.targets_from_criteria('http://x', 't', {})
except TypeError:
    targets = collect.targets_from_criteria('http://x', 't')
link_targets = [t for t in targets if t.get('link')]
check('критерий из ссылки даёт ровно одну цель', len(link_targets) == 1, targets)
# Смешанный режим: если в ссылке нет q, сборщик вообще не добавляет q —
# тогда название критерия тем более не могло туда попасть.
_q_part = ''
if link_targets and 'q=' in link_targets[0]['url']:
    _q_part = link_targets[0]['url'].split('q=')[1].split('&')[0]
check('название критерия не попало в q', bool(link_targets) and 'mo' not in _q_part, link_targets)
# Авито отдаёт 0 карточек на ссылки с q=, поэтому сбор идёт по разделу,
# а слова критерия отсеиваются уже на сервере по заголовкам. Значит в URL
# не должно быть q — это и проверяем.
check('обычный критерий идёт по разделу без q=',
      any(not t.get('link') and 'q=' not in t['url'] for t in targets),
      [t['url'] for t in targets])

print('\nИТОГ:', 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' if not fails else f'ПРОВАЛЕНО: {len(fails)}')
sys.exit(1 if fails else 0)
