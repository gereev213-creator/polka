"""Регресс: бот не должен переезжать на эфемерную базу.

Реальная авария: в образ добавили каталог /app/data (COPY data/), а код
выбирал путь к БД так: «если есть /app/data — бери его». В результате
каждый деплой создавал пустую базу внутри контейнера, и данные
пользователей пропадали.

Запуск: python3 tests/test_db_persistence.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
DOCKER = open(os.path.join(ROOT, 'Dockerfile'), encoding='utf-8').read()

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


check('/data — основной путь БД', '_default_db = "/data/polka.db"' in SRC)
check('/app/data только как запасной',
      'if not os.path.isdir("/data") and os.path.isdir("/app/data"):' in SRC)
check('нет старого переключения на /app/data',
      'if os.path.isdir("/app/data"):\n                    _default_db' not in SRC)
check('образ не создаёт каталог /app/data', 'COPY data/ ./data/' not in DOCKER)
check('словарь копируется в assets',
      'COPY data/ru_en_aliases.json ./assets/ru_en_aliases.json' in DOCKER)
check('словарь ищется в assets', "'assets', 'ru_en_aliases.json'" in SRC)
check('и в data (локальный запуск)', "'data', 'ru_en_aliases.json'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
