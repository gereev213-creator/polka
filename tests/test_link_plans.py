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


check('продукт 1 ссылка', "'link_1_30': (30, 'pay.rub_link1')" in SRC)
check('продукт 2 ссылки', "'link_2_30': (30, 'pay.rub_link2')" in SRC)
check('продукт 3 ссылки', "'link_3_30': (30, 'pay.rub_link3')" in SRC)
check('продукт 5 ссылок на 90 дней', "'link_5_90': (90, 'pay.rub_link5')" in SRC)
check('цена 1 ссылки 459 ₽ (как у Hunter)',
      "'pay.rub_link1': ('str', None, None, '459'" in SRC)
check('цена 2 ссылок 729 ₽', "'pay.rub_link2': ('str', None, None, '729'" in SRC)
check('цена 3 ссылок 999 ₽', "'pay.rub_link3': ('str', None, None, '999'" in SRC)
check('цена 5 ссылок 1 490 ₽', "'pay.rub_link5': ('str', None, None, '1490'" in SRC)
check('ссылки дают слоты', "_LINK_SLOTS = {'link_1_30': 1" in SRC)
check('5 ссылок дают 5 слотов', "'link_5_90': 5}" in SRC)
check('срок слотов из продукта', '_slot_days = int(CISPAY_PLANS[product][0])' in SRC)
check('подтверждение про ссылки', 'Мониторинг ссылок подключён' in SRC)
check('группа в витрине', "'Мониторинг ссылок с Авито'" in PAY)
check('подписи ссылок', "'1 ссылка'" in PAY or "link_1_30: '1 ссылка'" in PAY)
check('5 ссылок в витрине', "'link_5_90'" in PAY)
check('проверка раз в 5 минут в описании', 'проверка раз в 5 минут' in PAY)
check('скорость бесплатных 30 минут', "'link.check_free_min': ('int', 5, 1440, 30" in SRC)
check('скорость платных 5 минут', "'link.check_paid_min': ('int', 1, 1440, 5" in SRC)
check('сборщику отдаём интервал проверки', "row['check_interval_min'] = _link_check_min" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
