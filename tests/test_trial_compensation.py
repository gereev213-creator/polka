"""Пробный продлевается, если находок не было, и только потом пауза.

Правило продукта: сутки бесплатного поиска. Если человеку за это время не
пришло НИ ОДНОЙ находки — сутки продлеваются (до trial.max_extensions раз),
чтобы не брать деньги за пустоту. Пауза и предложение Плюса — только когда
находки были или лимит продлений исчерпан.

Запуск: python3 tests/test_trial_compensation.py
"""
import ast
import datetime
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

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


# Достаём чистую функцию решения и исполняем с нужными именами
tree = ast.parse(SRC)
node = next((n for n in tree.body
             if isinstance(n, ast.FunctionDef) and n.name == '_ttl_decision'), None)
check('функция решения найдена', node is not None)
# В боте `datetime` — это класс (from datetime import datetime), а не модуль
ns = {'FREE_CRITERION_TTL_HOURS': 24, 'datetime': datetime.datetime}
exec(ast.get_source_segment(SRC, node), ns)
decide = ns['_ttl_decision']

NOW = datetime.datetime(2026, 11, 2, 12, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=3)))


def at(hours_ago):
    return (NOW - datetime.timedelta(hours=hours_ago)).isoformat()


# 1) окно ещё идёт
check('10 часов — ждём', decide(NOW, at(10), 0, 0, 72) == 'wait')

# 2) сутки прошли, находок не было — продлеваем
check('25 ч без находок — продлить', decide(NOW, at(25), 0, 0, 72) == 'extend')

# 3) находки были — пауза (ценность показана)
check('25 ч с находками — пауза', decide(NOW, at(25), 0, 3, 72) == 'pause')

# 4) уже продлевали — новое окно 48 ч
check('25 ч после продления — ещё ждём', decide(NOW, at(25), 24, 0, 72) == 'wait')
check('50 ч после одного продления — продлить ещё',
      decide(NOW, at(50), 24, 0, 72) == 'extend')

# 5) лимит продлений исчерпан — пауза, даже без находок
# окно = 24 ч + 72 ч продлений = 96 ч
check('90 ч после трёх продлений — ещё ждём', decide(NOW, at(90), 72, 0, 72) == 'wait')
check('100 ч и лимит исчерпан — пауза', decide(NOW, at(100), 72, 0, 72) == 'pause')

# 6) платным и free продление не положено
check('free без продления — пауза', decide(NOW, at(25), 0, 0, 72, allow_extend=False) == 'pause')

# 7) битая дата не роняет цикл
check('битая дата — ждём', decide(NOW, 'не дата', 0, 0, 72) == 'wait')

# 8) сквозные связи в коде
check('пауза использует решение', 'decision = _ttl_decision(' in SRC)
check('продление вызывает компенсацию', '_extend_trial_compensation' in SRC)
check('миграция free_extended_hours есть',
      'ADD COLUMN free_extended_hours INTEGER' in SRC)
check('уведомление только у паузы', "report.setdefault('paused_rows'" in SRC)
check('продлённые не попадают в уведомления',
      "report.setdefault('extended_rows'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
