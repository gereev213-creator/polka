"""Разбор ссылки Авито: фильтры f=…, категория и город."""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

i = SRC.index('def parse_avito_filter_url(')
j = SRC.index('\n# Запросы-аксессуары', i)
k = SRC.index('AVITO_CATEGORY_SLUGS')
k_end = SRC.index('\n}', k) + 2

ns = {}
exec(SRC[k:k_end], ns)
exec(SRC[i:j], ns)
parse = ns['parse_avito_filter_url']

url = ('https://www.avito.ru/izhevsk/telefony/mobilnye_telefony/apple-ASgBAgICAUSSA8gQ'
       '?cd=1&f=ASgBAgECAUSSA8gQAUXGmgz6jQ0BRcaaDPqNDQ&q=iphone+13&pmin=20000&pmax=45000')
r = parse(url)
print('1) ссылка с фильтрами: категория', r['slug'], '· город', r['city'])
assert r['ok'] and r['filters'].startswith('&f='), r
assert r['has_price'], r

bad = parse('https://www.avito.ru/izhevsk/telefony?q=iphone')
print('2) ссылка без фильтров:', bad['error'])
assert not bad['ok'] and bad['error'] == 'no_filters'

not_url = parse('просто текст')
print('3) не ссылка:', not_url['error'])
assert not_url['error'] == 'bad_url'

# 4) Набор f=… переносится БЕЗ изменений: что Авито положил, то и уходит
#    сборщику. Мы его не разбираем и не фильтруем — иначе потеряли бы
#    состояние, память, продавца и всё прочее, что человек отметил.
blob = 'ASgBAgECAUSSA8gQAUXGmgz6jQ0BRcaaDPqNDQ'
same = parse(f'https://www.avito.ru/izhevsk/telefony?f={blob}')
print('4) набор фильтров сохранён целиком:', same['filters'] == '&f=' + blob)
assert same['filters'] == '&f=' + blob, same

complex_url = ('https://www.avito.ru/izhevsk/telefony?f=' + blob +
               '&q=iphone+13&pmin=20000&pmax=45000&s=104&user=1&d=1')
big = parse(complex_url)
print('5) сложная ссылка: категория', big['slug'], '· фильтры целы:', big['filters'] == '&f=' + blob)
assert big['filters'] == '&f=' + blob, big

# 6) Живая ссылка владельца: /all/ = все регионы, цена лежит внутри f=…
real = ('https://m.avito.ru/all/telefony/mobilnye_telefony/apple/iphone_15_pro-ASgBAgICA0SywA2Sn~0RtMANzqs5sMENiPw3'
        '?f=ASgBAQECA0SywA2Sn~0RtMANzqs5sMENiPw3AUDo6w40~P3bAvr92wL8_dsCAkXGmgwVeyJmcm9tIjowLCJ0byI6MzUwMDB9'
        'gu4OFXsiZnJvbSI6ODAsInRvIjpudWxsfQ&user=1')
r = parse(real)
print('6) живая ссылка: категория', r['slug'], '· город', repr(r['city']),
      '· цена в фильтрах:', r['has_price'])
assert r['ok'] and r['city'] == '', r
assert r['has_price'], r
assert 'from' in r['filters'] or r['filters'].startswith('&f='), r

print('\nразбор ссылок Авито: все проверки пройдены')
