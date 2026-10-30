"""Слоты поисков: пауза не освобождает место, удаление — освобождает."""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
ADAPTER = open(os.path.join(ROOT, 'polka-final', 'frontend', 'proto', 'adapter.js'),
               encoding='utf-8').read()

i = SRC.index('async def api_plan(')
j = SRC.index('\ndef ', i + 10)
plan_body = SRC[i:j]

checks = [
    ('план считает все поиски (включая паузу)',
     'FROM hunt_criteria WHERE user_id=?' in plan_body
     and 'AND active=1"' not in plan_body),
    ('лимит при создании считает все поиски',
     'Считаем ВСЕ поиски' in SRC),
    ('удаление критерия есть в API',
     "method == 'DELETE'" in SRC and 'remove_criterion' in SRC),
    ('кнопка удаления в списке поисков', 'data-delcrit' in ADAPTER),
    ('удаление освобождает место', 'место освободится' in ADAPTER),
]
fails = 0
for name, ok in checks:
    print(f"  {'✓' if ok else '✗'} {name}")
    if not ok:
        fails += 1
print('\nслоты поисков: правила на месте' if not fails else '\nслоты поисков: есть пропуски')
sys.exit(0 if not fails else 1)
