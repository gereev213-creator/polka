"""Синонимы: русское и латинское написание бренда должны совпадать."""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
i = SRC.index('QUERY_SYNONYMS = {')
j = SRC.index('\n}', i) + 2
ns = {'re': re}
exec(SRC[i:j], ns)
SYN = ns['QUERY_SYNONYMS']


def variants(word):
    key = str(word or '').lower()
    return SYN.get(key, (key,))


cases = [
    ('шорты кархарт', 'Шорты Carhartt деним'),
    ('фен dyson', 'Фен Дайсон Supersonic'),
    ('кроссовки найк', 'Кроссовки Nike Air'),
    ('плойка', 'Стайлер Dyson Airwrap'),
    ('куртка напапири', 'Куртка Napapijri'),
    ('ботинки тимберленд', 'Ботинки Timberland 42'),
]

fails = 0
for query, title in cases:
    words = [w for w in query.split() if not w.isdigit()]
    ok = all(any(v in title.lower() for v in variants(w)) for w in words)
    print(f"  {'✓' if ok else '✗'} «{query}» → «{title}»")
    if not ok:
        fails += 1

print('\nсинонимы: работают' if not fails else '\nсинонимы: есть промахи')
sys.exit(0 if not fails else 1)
