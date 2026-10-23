"""Промокоды-скидки: тип, проверка, применение и выключение."""
import re, sys, os

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()
JSX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'polka-final/frontend/src/App.jsx'), encoding='utf-8').read()
API = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'polka-final/frontend/src/api.js'), encoding='utf-8').read()

checks = []
# 1. тип «скидка» объявлен и подписан
checks.append(("тип discount в PROMO_KINDS", "'discount'" in SRC))
checks.append(("подпись типа для админки", "'discount': 'скидка на оплату, %'" in SRC))
# 2. ограничение 90 %
checks.append(("скидка не больше 90 %", "скидка не больше 90 %" in SRC))
# 3. включение и выключение
checks.append(("функция promo_set_active", 'def promo_set_active(' in SRC))
checks.append(("админка принимает activate", "'activate'" in SRC))
# 4. проверка кода до оплаты
checks.append(("функция promo_discount", 'def promo_discount(' in SRC))
checks.append(("эндпоинт promo-check", "'/api/pay/promo-check'" in SRC))
# 5. применение к сумме
checks.append(("скидка уменьшает сумму", "(100 - discount) / 100" in SRC))
checks.append(("код пишется в платёж", 'promo_code, discount_percent' in SRC))
# 6. учёт использования после оплаты
checks.append(("учёт применения", 'promo_mark_used' in SRC))
# 7. клиент
checks.append(("кнопка «Выключить» в админке", "'Выключить'" in JSX))
checks.append(("поле скидки на экране тарифов", 'discountPct' in JSX))
checks.append(("api.promoCheck", 'promoCheck' in API))
checks.append(("api.pawCreate передаёт promo", "promo = ''" in API))

ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nскидки: все проверки пройдены' if ok else '\nскидки: есть ошибки')
sys.exit(0 if ok else 1)
