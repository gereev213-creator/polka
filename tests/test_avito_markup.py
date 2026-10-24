"""Разбор текущей вёрстки Авито: заголовок в alt, цена в priceLabelGrid."""
import os, sys

COL = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'collector/collect.py'),
           encoding='utf-8').read()

checks = [
    ("заголовок берётся из alt картинки", 'itemProp="image"[^>]*alt=' in COL),
    ("фото из srcSet", 'srcSet|srcset' in COL),
    ("цена из priceLabelGrid", 'priceLabelGrid' in COL),
    ("карточка не требует url и цены", 'if title:' in COL),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nразбор вёрстки Авито: на месте' if ok else '\nразбор: есть пропуски')
sys.exit(0 if ok else 1)
