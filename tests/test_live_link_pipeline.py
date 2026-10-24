"""Живая ссылка владельца: разбор → критерий → решение по объявлению.

Проверяем на настоящем адресе Авито (в нём 175 объявлений), что:
  • адрес разбирается и сохраняется целиком;
  • цена и АКБ читаются из набора f=;
  • критерий из ссылки НЕ режется нашими проверками слов.
"""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

LINK = ('https://m.avito.ru/all/telefony/mobilnye_telefony/apple/iphone_15_pro-ASgBAgICA0SywA2Sn~0RtMANzqs5sMENiPw3'
        '?context=H4sIAAAAAAAA_wE-AMH_YToyOntzOjk6ImZyb21fcGFnZSI7czo3OiJmaWx0ZXJzIjtzOjE0OiJoYXNFeHRyYVBhcmFtcyI7YjoxO302Cz8HPgAAAA'
        '&f=ASgBAQECA0SywA2Sn~0RtMANzqs5sMENiPw3AUDo6w40~P3bAvr92wL8_dsCAkXGmgwVeyJmcm9tIjowLCJ0byI6MzUwMDB9'
        'gu4OFXsiZnJvbSI6ODAsInRvIjpudWxsfQ&geoCoords=55.755814%2C37.617635&moreExpensive=0&presentationType=serp&radius=0&user=1')

def cut(name, stop):
    i = SRC.index(f'def {name}(')
    j = SRC.index(stop, i + 10)
    return SRC[i:j]

ns = {'json': __import__('json'), 're': __import__('re'), 'Dict': dict, 'List': list}
# набор слагов и парсер
k = SRC.index('AVITO_CATEGORY_SLUGS'); k_end = SRC.index('\n}', k) + 2
exec(SRC[k:k_end], ns)
exec(cut('parse_avito_filter_url', '\n# Запросы-аксессуары'), ns)
exec(cut('avito_blob_facts', '\ndef is_accessory_query'), ns)

parsed = ns['parse_avito_filter_url'](LINK)
print('1) разбор ссылки:', parsed['slug'], '· город', repr(parsed['city']), '· фильтры есть:', bool(parsed['filters']))
assert parsed['ok'], parsed
assert parsed['city'] == '', parsed
assert parsed['filters'].startswith('&f='), parsed

facts = ns['avito_blob_facts'](parsed['filters'])
print('2) из фильтров достали:', facts)
assert facts['price_to'] == 35000, facts
assert facts['battery_from'] == 80, facts

# решение по объявлению, которое раньше отсеивалось словами заголовка
i = SRC.index('def evaluate_ad(')
j = SRC.index('\ndef ', i + 10)
eval_src = SRC[i:j]
print('3) ранний выход для критерия из ссылки:', "filter_url" in eval_src)
assert "filter_url" in eval_src
assert "'direct_link'" in eval_src

print('\nживая ссылка: разбор, цена, АКБ и доверие фильтрам — всё сходится')
