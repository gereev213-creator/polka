"""Платежи: воронка, чистка брошенных счетов и видимость в админке.

Разбор показал: 20 счетов PayAnyWay создали 4 тестовых аккаунта, реальные
люди до оплаты не доходили. Чтобы это стало измеримым, а брошенные счета
не висели вечно, добавлены события воронки и просрочка.

Запуск: python3 tests/test_payments_funnel.py
"""
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


# 1) брошенные счета не висят в waiting вечно
check('есть просрочка счетов', 'def expire_stale_invoices(' in SRC)
check('просрочивает только waiting', "WHERE status='waiting'" in SRC)
check('ставит статус expired', "status='expired'" in SRC)
check('вызывается в фоновой чистке', 'await asyncio.to_thread(expire_stale_invoices)' in SRC)

# 2) воронка: открытие тарифов считается сервером
check('событие tariffs_opened пишется', "'tariffs_opened'" in SRC)
check('пишется при запросе тарифов', "_plan_event(int(viewer), 'tariffs_opened'" in SRC)

# 3) у PAW есть invoice_created (раньше было только у CISPay)
check('PAW пишет invoice_created', "'product': product, 'provider': 'paw'" in SRC)

# 4) админ видит неоплаченные счета
check('есть сводка по счетам', 'def _payments_waiting_summary(' in SRC)
check('сводка показывает количество', 'Счета созданы, но не оплачены' in SRC)
check('в экране платежей она используется', '_payments_waiting_summary()' in SRC)

# 5) витрина тарифов и A/B цены входа
check('сервер отдаёт тариф по умолчанию', "'default_product'" in SRC)
check('A/B по чётности user_id', "_bucket = int(viewer or 0) % 2" in SRC)
check('неделя как альтернатива месяцу', "'week' if _bucket == 0 else 'plus_30'" in SRC)
check('событие pay_click пишется', "'pay_click'" in SRC)
PAY = open(os.path.join(HERE, '..', 'polka-final/frontend/proto/payments.js'),
           encoding='utf-8').read()
check('клиент выбирает тариф по умолчанию', 'data.default_product' in PAY)
check('клиент рисует кнопки тарифов', 'renderPlanChips' in PAY)
check('кнопка показывает сумму', "'Оплатить ' + rub(price)" in PAY)
check('цена по сроку тарифа', "rub/нед" in PAY)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
