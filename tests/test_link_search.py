"""Поиск по ссылке с Авито (как у Avito Hunter).

Человек копирует адрес своей выдачи со всеми фильтрами — мы следим за
ней. Оживлён после того, как владелец показал модель конкурента:
Avito Hunter продаёт именно подписку на поисковые ссылки.

Запуск: python3 tests/test_link_search.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
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


check('есть вход «Ссылка с Авито»', 'id="searchLink"' in TPL and 'id="searchLink"' in IDX)
check('разбор ссылки на сервере', 'def parse_avito_search_link(' in SRC)
check('создание критерия из ссылки', 'search_link: link, query: q' in ADP)
check('ссылки больше не отбиваются как неподдержанные',
      'Ссылки с Авито больше не поддерживаются' not in SRC
      and 'Следим за вашей ссылкой с Авито' in SRC)
check('критерий хранит from_link', 'from_link=1' in SRC)
check('критерий из ссылки не режется словами', "return Decision(True, 'ok', 'по ссылке')" in SRC)
check('город не применяется к ссылкам', "return Decision(True, 'ok', 'по ссылке')" in SRC)
check('ссылка хранит исходный адрес', "row['filter_url'] = str(row.get('filter_url') or '')" in SRC)
check('есть словарь город-слаг', 'def collector_city_slugs(' in SRC)
check('подсказка про копирование адреса', 'скопируйте адрес из строки браузера' in TPL)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
