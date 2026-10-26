"""Тесты ядра сборщика: разбор ссылки, разделы, фильтры, отбор.

Каждый тест появился из реальной поломки:
- «шапка levis» — критерий уходил на /all, потому что раздел не определялся;
- 439 на глубоких ссылках — путь не обрезался до регион/раздел;
- ноль находок — фильтры ссылки требовали код модели, которого нет в заголовках.

Запуск: python3 tests/test_collector_core.py
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECT = os.path.join(HERE, '..', 'collector', 'collect.py')

spec = importlib.util.spec_from_file_location('collect', COLLECT)
collect = importlib.util.module_from_spec(spec)
sys.argv = ['collect.py', '--selftest']
spec.loader.exec_module(collect)

ok = 0
fail = 0


def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'ok   {name}')
    else:
        fail += 1
        print(f'FAIL {name}  {extra}')


LINK = ('https://m.avito.ru/moskva/telefony/apple/iphone_15_pro-ASgBAgICAkS0wA3OqzmwwQ2I_Dc'
        '?f=ASgBAQICAkS0wA3O&radius=50&pmax=50000&pmin=1000&user=1&q=iphone+15+pro')

# ── раздел из ссылки ────────────────────────────────────────────────────────
check('ссылка: раздел сразу после региона',
      collect.category_url_from(LINK) == 'https://www.avito.ru/moskva/telefony?s=104',
      collect.category_url_from(LINK))
check('ссылка: без региона тоже работает',
      collect.category_url_from('https://www.avito.ru/all/noutbuki/x') == 'https://www.avito.ru/all/tovary_dlya_kompyutera?s=104')
check('ссылка: мусор даёт пустую строку',
      collect.category_url_from('https://example.com/what') == '')

# ── фильтры из ссылки ───────────────────────────────────────────────────────
flt = collect.local_filters_from_url(LINK)
# Цена лежит в зашифрованном f=; проверяем на реальном шифре
_real = ('https://m.avito.ru/all/noutbuki/apple/do50-ASgBAgECAUSo5A302WYBRcaaDBV7ImZyb20iOjAsInRvIjo1MDAwMH0'
         '?f=ASgBAgECA0TwvA2I0jSg5A3Ot~sRqOQN9NlmAUXGmgwVeyJmcm9tIjowLCJ0byI6NTAwMDB9')
_flt = collect.local_filters_from_url(_real)
check('фильтры: цена 50 000 из настоящей ссылки', _flt.get('price_to') == 50000, _flt)
check('фильтры: слова из пути (модель)',
      isinstance(flt.get('words'), list), flt)

# ── отбор ───────────────────────────────────────────────────────────────────
check('отбор: дороже лимита отклоняется',
      not collect.matches_local({'price': 90000, 'title': 'iPhone 15 Pro'}, {'price_to': 50000}))
check('отбор: дешевле лимита отклоняется',
      not collect.matches_local({'price': 500, 'title': 'iPhone 15 Pro'}, {'price_from': 1000}))
check('отбор: в цене проходит',
      collect.matches_local({'price': 40000, 'title': 'iPhone 15 Pro'}, {'price_to': 50000}))
check('отбор: без слов проходит',
      collect.matches_local({'price': 10000, 'title': 'что угодно'}, {'price_to': 50000}))
check('отбор: чужое слово отклоняется',
      not collect.matches_local({'price': 10000, 'title': 'Samsung'}, {'words': ['iphone']}))

# ── ссылка для сборщика ─────────────────────────────────────────────────────
u = collect.link_search_url({'search_path': 'moskva/telefony/apple/iphone_15_pro-ASgB',
                             'search_q': 'iphone 15 pro', 'user': '1',
                             'max_price': 50000, 'min_price': 0})
check('цель: глубокий путь обрезан до регион/раздел', 'moskva/telefony?' in u, u)
check('цель: q в адрес не попадает (Авито блокирует)', 'q=' not in u, u)
check('цель: цена в адресе', 'pmax=50000' in u, u)
check('цель: опасный путь отклоняется', collect.link_search_url({'search_path': '../etc/passwd'}) == '')
check('цель: пустой путь отклоняется', collect.link_search_url({'search_path': ''}) == '')

# ── разделы по словам: главная причина «шапки вместо джинсов» ───────────────
server_rows = {'items': [
    {'query': 'Levis', 'category': '', 'max_price': 3000},
    {'query': 'джинсы levis', 'category': '', 'max_price': 3000},
    {'query': 'iPhone 15 Pro', 'category': '', 'max_price': 35000},
    {'query': 'MacBook Air M1', 'category': '', 'max_price': 50000},
]}
collect.fetch_json = lambda *a, **k: server_rows
import argparse
cfg = argparse.Namespace(**{'targets': [], 'max_targets': 10})
targets = collect.targets_from_criteria('http://x', 't', {'targets': [], 'max_targets': 10})
urls = [t['url'] for t in targets]
check('разделы: Levis → одежда, а не весь сайт',
      any('/all/odezhda_obuv_aksessuary' in x for x in urls), urls)
check('разделы: джинсы → одежда',
      sum(1 for x in urls if 'odezhda_obuv_aksessuary' in x) >= 1, urls)
check('разделы: iPhone → телефоны',
      any('/all/telefony' in x for x in urls), urls)
# Раздел «ноутбуки» Авито держит под 439, поэтому он заменяется на
# «товары для компьютера» — это проверяется отдельно ниже.
check('разделы: MacBook → компьютеры (ноутбуки под блокировкой)',
      any('/all/tovary_dlya_kompyutera' in x for x in urls), urls)
check('разделы: нет цели «весь сайт»',
      not any(x.rstrip('/').endswith('/all') or '/all?' in x for x in urls), urls)


# ── продавец в карточке ─────────────────────────────────────────────────────
_card_private = ('<div data-marker="item"><img itemProp="image" alt="Джинсы Levis 501">'
                 '<div class="priceLabelGrid">1 900 ₽</div><div>Частное лицо</div></div>')
_priv = collect.items_from_microdata(_card_private)
check('продавец: частное лицо распознано',
      bool(_priv) and _priv[0].get('seller_type') == 'private', _priv)

_card_shop = ('<div data-marker="item"><img itemProp="image" alt="Джинсы Levis 501">'
              '<div class="priceLabelGrid">1 900 ₽</div>'
              '<a data-marker="seller-link/link" href="/brands/levis">Levis</a></div>')
_shop = collect.items_from_microdata(_card_shop)
check('продавец: магазин распознан',
      bool(_shop) and _shop[0].get('seller_type') == 'shop', _shop)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
