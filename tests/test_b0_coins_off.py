"""B0: монеты и Telegram Stars убраны из продукта.

Проверяем по исходнику (быстро и без запуска сервера):
  * при COINS_ENABLED=0 в промокодах нет вида «монеты»;
  * расход монет и оплата звёздами отвечают понятным отказом;
  * getPlan больше не отдаёт баланс монет;
  * флаг оставлен на случай откату, и таблицы при этом не удаляются.

Запуск: python3 tests/test_b0_coins_off.py
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

# 1. Флаг существует и по умолчанию выключен
assert re.search(r'COINS_ENABLED = os\.environ\.get\("COINS_ENABLED", "0"\) == "1"', SRC), \
    'флаг COINS_ENABLED не найден или включён по умолчанию'
print('1) COINS_ENABLED по умолчанию выключен')

# 2. Промокоды: вид «монеты» только при включённом флаге
assert ("PROMO_KINDS = (('plus_days', 'coins', 'criterion_days', 'trial_days')\n"
        "                if COINS_ENABLED else ('plus_days', 'criterion_days', 'trial_days'))") in SRC, \
    'PROMO_KINDS не зависит от флага'
print('2) промокоды без вида «монеты» при выключенном флаге')

# 3. Расход монет и оплата звёздами закрыты
assert SRC.count('if not COINS_ENABLED:') >= 2, 'нет отказов в обработчиках монет/Stars'
assert "error': 'coins_disabled'" in SRC, 'нет отказа для /api/coins/spend'
assert "error': 'stars_disabled'" in SRC, 'нет отказа для /api/pay/invoice'
print('3) монеты и звёзды отвечают понятным отказом')

# 4. getPlan не отдаёт баланс монет
assert "'balance': coins_balance(viewer_id)," not in SRC, 'getPlan всё ещё отдаёт баланс'
assert "if COINS_ENABLED else {}" in SRC, 'баланс в getPlan не спрятан за флагом'
print('4) getPlan не отдаёт баланс монет')

# 5. Таблицы монет не удаляются: миграция остаётся, DROP нет
assert 'CREATE TABLE IF NOT EXISTS coin_wallets' in SRC, 'таблица кошелька удалена — балансы потеряны'
assert 'DROP TABLE coin_wallets' not in SRC and 'DROP TABLE coin_transactions' not in SRC, \
    'таблицы монет удаляются — балансы людей сгорят молча'
print('5) таблицы монет сохранены, удаления нет')

# 6. Продукт «Плюс» и оплата картой на месте
assert 'CISPAY_PLANS' in SRC and 'cispay_order_create' in SRC, 'оплата картой пропала'
assert "_grant_plus_days" in SRC, 'начисление «Плюса» пропало'
print('6) «Плюс» и оплата картой на месте')

print('\nB0: монеты и Stars убраны, «Плюс» работает')
