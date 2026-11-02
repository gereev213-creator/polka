"""Единый сборщик на ноутбуке: серверный выключается настройкой.

Владелец: «конечно всё на ноуте, я зря его не выключаю». Значит сервер не
должен дублировать сбор: у него есть переключатель collector.inline, который
читается каждый проход (без рестарта). Ноутбук в полном режиме ищет выдачу
И приносит описания/параметры.

Запуск: python3 tests/test_collector_mode.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
COL = open(os.path.join(ROOT, 'collector/collect.py'), encoding='utf-8').read()
BAT = open(os.path.join(ROOT, 'collector/start-windows.bat'), encoding='utf-8').read()

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


# сервер: выключатель серверного сбора
check('есть настройка collector.inline', "cfg_get('collector.inline')" in SRC)
check('при 0 сервер не собирает', "== '0'" in SRC and 'Серверный сбор выключен' in SRC)
check('включение без рестарта', 'await asyncio.sleep(300)' in SRC)

# ноутбук: полный режим тянет описания по ответу сервера
check('полный сбор берёт need_details', "stats.get('need_details')" in COL)
check('описания вызываются в проходе', 'collect_details(server, token, source, _slice)' in COL)
check('паузы описаний из env', "POLKA_DETAILS_PAUSE_MIN" in COL)
check('паузы по умолчанию применяются', 'if pause is None:' in COL)
check('сколько описаний за проход настраивается', 'POLKA_DETAILS_PER_PASS' in COL)

# лаунчер для ноутбука
check('лаунчер задаёт число описаний', 'POLKA_DETAILS_PER_PASS=6' in BAT)
check('лаунчер задаёт паузы', 'POLKA_DETAILS_PAUSE_MIN=40' in BAT and
      'POLKA_DETAILS_PAUSE_MAX=80' in BAT)
check('лаунчер включает браузерный профиль', 'AVITO_PROFILE' in BAT)
check('лаунчер работает циклично', '--loop' in BAT)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
