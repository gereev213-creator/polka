"""Чистка базы не должна удалять доску: ни ботовую, ни из мини-аппа.

Реальная поломка: чистка удаляла всё, у чего source <> 'polka'. Объявления,
поданные через мини-апп, помечаются source='miniapp' — они и стирались
каждые 6 часов и при каждом перезапуске. Человек открывал «Барахолку»,
а там пусто, хотя объявления были.

Запуск: python3 tests/test_cleanup_keeps_board.py
"""
import os
import sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

i = SRC.index('def cleanup_findings()')
j = SRC.index('\ndef ', i + 10)
body = SRC[i:j]

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


check('чистка исключает доску мини-аппа', "NOT IN ('polka','miniapp')" in body)
check('нет удаления по старому условию', "source <> 'polka' " not in body)
check('условие встречается дважды (мусор и выгодные)',
      body.count("NOT IN ('polka','miniapp')") == 2)

# Подбор находок не должен тянуть доску в критерии
hunt_i = SRC.index('sql = ("SELECT * FROM ads WHERE COALESCE(source')
check('находки берут только Авито', "NOT IN \"\n                   \"('polka','miniapp')" in SRC
      or "('polka','miniapp')" in SRC[hunt_i:hunt_i + 200])

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
