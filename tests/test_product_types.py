"""Тип товара: «шорты carhartt» не должно находить куртку того же бренда."""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()

start = SRC.index('HUNT_TYPE_ROOTS = (')
end = SRC.index('def _query_words_required(query: str) -> list:')
ns = {}
exec(SRC[start:end], ns)
conflict = ns['hunt_type_conflict']

cases = [
    # (запрос, заголовок, должен ли отклониться по типу)
    ('шорты carhartt', 'Шорты Carhartt деним', False),
    ('шорты carhartt', 'Куртка Carhartt зимняя', True),
    ('шорты carhartt', 'Шорты Nike', False),          # отсеется словами, не типом
    ('фен dyson', 'Пылесос Dyson V15', True),
    ('фен dyson', 'Фен Dyson Supersonic', False),
    ('куртка мужская nike', 'Куртка Nike Sportswear', False),
    ('куртка мужская nike', 'Кроссовки Nike Air', True),
    ('ноутбук apple', 'Ноутбук Apple MacBook Air', False),
    ('ноутбук apple', 'Планшет Apple iPad', True),
]

fails = 0
for q, title, expect in cases:
    got = conflict(q, title)
    good = bool(got) == expect
    print(f"  {'✓' if good else '✗'} «{q}» / «{title}» → {got or 'ок'}")
    if not good:
        fails += 1

print('\nтипы товаров: правила работают' if not fails else '\nтипы товаров: есть ошибки')
sys.exit(0 if not fails else 1)
