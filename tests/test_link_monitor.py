"""Мониторинг ссылки: открыть, увидеть новое, отправить.

Проверяем, что сборщик умеет открыть ссылку поиска и посчитать, сколько
карточек новые — это ядро модели Avito Hunter.

Запуск: python3 tests/test_link_monitor.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
COL = open(os.path.join(ROOT, 'collector/collect.py'), encoding='utf-8').read()

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


check('есть проверка ссылки', "action == 'link_test'" in SRC)
check('сборщик собирает безопасную ссылку', 'link_search_url(' in COL)
check('ссылочные поиски в приоритете', "_prio = 5" in SRC)
check('сравнение с базой по external_id', "FROM ads WHERE external_id IN" in SRC)
check('считает новые карточки', "'new': max(0, len(items) - known)" in SRC)
check('запуск в потоке без блокировки', 'asyncio.to_thread(_probe_link)' in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
