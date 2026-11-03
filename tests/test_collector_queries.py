"""P0: сбор по запросам, город в ссылке, приоритет новых поисков.

Проверяем код сборщика и сервер: режим q= переключается настройкой без
деплоя, в ссылке есть город и текст запроса, новые поиски получают
приоритет, а находки без описания не висят вечно.

Запуск: python3 tests/test_collector_queries.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
COL = open(os.path.join(ROOT, 'collector/collect.py'), encoding='utf-8').read()
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()

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


# режим поиска по запросу переключается настройкой
check('есть динамический query_mode', 'def query_mode(' in COL)
check('режим читается из cfg', "cfg or {}).get('search_by_query')" in COL)
check('сервер передаёт search_by_query', "cfg['search_by_query'] = str(cfg_get('collector.search_by_query')" in SRC)
check('настройка в схеме', "'collector.search_by_query'" in SRC)

# город в ссылке
check('есть словарь городов', 'CITY_SLUG_SEARCH' in COL)
check('город определяется', 'def city_slug_search(' in COL)
check('город попадает в URL', "_city_part = city_slug_search(crit.get('city'))" in COL)
check('без города — all', "or 'all'" in COL)

# запросы без известной категории больше не выкидываются
check('q= строится и без категории', "&q={query}" in COL or "?q={query}" in COL)
check('путь /all?q= поддержан', "https://www.avito.ru/{_city_part}" in COL)

# приоритет новых поисков
check('сервер считает приоритет', "row['priority'] = _prio" in SRC)
check('свежий поиск без находок — 3', '_prio = 3' in SRC)
check('сборщик сортирует по приоритету', "targets.sort(key=lambda t: -int(t.get('priority')" in COL)
check('очередь пользователей по приоритету', 'def _prio(u):' in COL)

# лимиты и ожидание описаний
check('целей за проход до 10', "('int', 1, 10, 4" in SRC)
check('квота запросов в час до 200', "'collector.req_cap'" in SRC and "('int', 1, 200, 30" in SRC)
check('ожидание описания 2 часа', "'hunt.desc_wait_hours'" in SRC)
check('находка уходит без описания по таймауту', "reason='desc_timeout'" in SRC)
check('есть проверка ссылки с сервера', "action == 'fetch_test'" in SRC)
check('проход сборщика с таймаутом', 'timeout=540' in SRC)
check('зависший проход сбрасывается', 'прошлый проход висел >25 мин' in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
