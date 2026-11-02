"""Продление подписки и оплата с баланса рефералов.

Проверки:
- напоминание о продлении за 3 дня: текст и связи в коде;
- цена при оплате с баланса берётся из настроек, а не «149 на угад»;
- клиент показывает кнопку «Оплатить с баланса».

Запуск: python3 tests/test_renewal_and_balance.py
"""
import ast
import datetime
import html
import os
import sys
from typing import Any, Dict, List

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
PAY = open(os.path.join(ROOT, 'polka-final/frontend/proto/payments.js'), encoding='utf-8').read()

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


# 1) текст напоминания (реальная функция)
tree = ast.parse(SRC)
node = next((n for n in tree.body
             if isinstance(n, ast.FunctionDef) and n.name == '_renew_caption'), None)
check('функция текста продления найдена', node is not None)
ns = {'datetime': datetime.datetime}
exec(ast.get_source_segment(SRC, node), ns)
cap = ns['_renew_caption']
text = cap(3, '2026-11-05T10:00:00+03:00')
check('пишет, что Плюс заканчивается', 'заканчивается' in text)
check('называет срок в днях', 'через 3 дн.' in text)
check('показывает дату', '05.11' in text)
check('объясняет последствие', 'встанут на паузу' in text)
check('предлагает продлить и цену', '149 ₽' in text and '49 ₽' in text)

# 2) связи в коде
check('цикл продления есть', 'async def _renewal_loop(' in SRC)
check('цикл запускается', "create_task(_renewal_loop(" in SRC)
check('напоминаем за 3 дня', 'RENEW_REMIND_DAYS = 3' in SRC)
check('не спамим: отметка по сроку', "f'renew:{uid}'" in SRC)
check('заблокированных пропускаем', 'uid in blocked' in SRC)
check('есть предпросмотр renew_test', "action == 'renew_test'" in SRC)

# 3) оплата с баланса: цена из настроек
check('цена через CISPAY_PLANS', "CISPAY_PLANS[_prod_key][1]" in SRC)
check('нет чтения несуществующей pay_plans', 'FROM pay_plans' not in SRC)
check('событие balance_pay', "'balance_pay'" in SRC)
check('клиент знает про кнопку баланса', 'balancePayBtn' in PAY)
check('клиент шлёт product в with-balance', "'/api/pay/with-balance'" in PAY)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
