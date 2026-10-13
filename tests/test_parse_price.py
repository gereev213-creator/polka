"""Тесты этапа D7: разбор цены в сборщике.

Было: все нецифровые символы вырезались, и «1 250,50 ₽» становилось 125050 —
объявление уходило в ленту с ценой в сто раз больше.

Запуск: python3 tests/test_parse_price.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'collector'))

import collect  # noqa: E402

CASES = [
    ('1 250 ₽', 1250),
    ('1 250,50 ₽', 1250),
    ('1250.50', 1250),
    ('1.250.000 ₽', 1250000),
    ('от 1 200 ₽', 1200),
    ('10 000 – 12 000 ₽', 10000),
    ('2 000 ₽/мес', 0),
    ('1 500 ₽ в месяц', 0),
    ('в рассрочку 990 ₽', 0),
    ('бесплатно', 0),
    ('', 0),
    ('цена не указана', 0),
    ('45 390 ₽', 45390),
    ('1250', 1250),
    (1250, 1250),
    (1250.9, 1250),
]
bad = []
for raw, want in CASES:
    got = collect.parse_price(raw)
    if got != want:
        bad.append((raw, got, want))
assert not bad, bad
print(f'D7: {len(CASES)} кейсов цены разобраны верно')

# Платёж в месяц не должен попадать в находки как цена
assert collect.parse_price('2 000 ₽/мес') == 0
item = {'title': 'iPhone 13', 'price': collect.parse_price('2 000 ₽/мес')}
assert item['price'] == 0, 'карточка с платежом должна пропускаться (price=0)'
print('D7: платёж «в месяц» даёт 0 — карточка пропускается')
