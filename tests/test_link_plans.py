"""Тарифы на мониторинг поисковых ссылок — один в один как у Avito Hunter.

У Hunter: 1 ссылка 30 дней — 459 ₽, 2 — 729 ₽, 3 — 999 ₽. Берём те же
цены: человек сравнивает с конкурентом и видит «столько же», а не
подозрительно дешевле. Плюс наш апселл для перекупов — 5 ссылок на
90 дней за 1 490 ₽. Скорость честная: бесплатно 30 минут, платно 5.

Запуск: python3 tests/test_link_plans.py
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


check('матрица цен в коде', 'LINK_PRICES = {' in SRC)
check('1 ссылка 7 дней — 169 ₽ (как у Hunter)', "(1, 7): 169" in SRC)
check('1 ссылка 14 дней — 259 ₽', "(1, 14): 259" in SRC)
check('1 ссылка 30 дней — 459 ₽ (как у Hunter)', "(1, 30): 459" in SRC)
check('2 ссылки 30 дней — 729 ₽', "(2, 30): 729" in SRC)
check('3 ссылки 30 дней — 999 ₽', "(3, 30): 999" in SRC)
check('1 ссылка 90 дней — 1 290 ₽', "(1, 90): 1290" in SRC)
check('5 ссылок только на 90 дней — 3 490 ₽', "(5, 90): 3490" in SRC)
check('все комбинации — продукты оплаты',
      "CISPAY_PLANS[f'link_{_lk_n}_{_lk_d}'] = (_lk_d," in SRC)
check('цена комбинации перекрывается настройкой',
      "key = f'pay.rub_link_{int(links)}_{int(days)}'" in SRC)
check('конструктор для клиента — матрица',
      'def link_matrix_public()' in SRC and "'link_matrix': link_matrix_public()" in SRC)
check('начисление по ссылкам и сроку из продукта',
      'slots, _slot_days = _link_combo' in SRC)
check('подтверждение про ссылки', 'Мониторинг ссылок подключён' in SRC)
check('разбор продукта link_N_D', 'def link_combo_of(product: Any)' in SRC)
# фронтенд: конструктор
check('в приложении конструктор ссылок', 'link_matrix' in PAY)
check('чипы «сколько ссылок» и «срок»',
      "chipRow('Сколько ссылок'" in PAY and "chipRow('Срок'" in PAY)
check('цена и кнопка пересчитываются', 'Оплатить ' in PAY and 'paintPlans' in PAY)
check('экономия за 90 дней', 'savingsFor' in PAY)
check('бесплатно — 1 ссылка', 'Бесплатно' in TPL and '1 ссылка' in TPL)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
