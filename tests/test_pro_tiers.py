"""PRO-тарифы для перекупов по данным конкурентов.

Обзоры (workspace.ru, otzyvmarketing.ru): Avtoringer 500/1300/2500 ₽/мес по
скорости, Autodrom 500 ₽/нед, Эхолот 3000 ₽/мес, Superseller от 4900 ₽/мес.
Наш безлимит за 140 ₽ — сильно ниже рынка; PRO 490/1290 ₽ закрывает нишу.

Запуск: python3 tests/test_pro_tiers.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
PAY = open(os.path.join(ROOT, 'polka-final/frontend/proto/payments.js'), encoding='utf-8').read()
TPL = open(os.path.join(ROOT, 'polka-final/frontend/proto/template.html'), encoding='utf-8').read()

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


check('PRO 30 дней в планах', "'pro_30': (30, 'pay.rub_pro30')" in SRC)
check('PRO 90 дней в планах', "'pro_90': (90, 'pay.rub_pro90')" in SRC)
check('цена PRO 30 = 490', "'pay.rub_pro30': ('str', None, None, '490'" in SRC)
check('цена PRO 90 = 1290', "'pay.rub_pro90': ('str', None, None, '1290'" in SRC)
check('PRO начисляет Плюс на срок', "if product in ('pro_30', 'pro_90'):" in SRC)
check('PRO добавляет слоты', 'slot_purchases' in SRC and '_slots = 10 if product == ' in SRC)
check('PRO уведомляет', 'PRO активирован' in SRC)
check('PRO в витрине', "'pro_30', 'pro_90']" in PAY)
check('подпись PRO', "'PRO · 30 дней'" in PAY)
check('подсказка про перекупов', 'Для перекупов — PRO' in TPL)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
