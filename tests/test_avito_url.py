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

print('\nразбор ссылок Авито: все проверки пройдены')
