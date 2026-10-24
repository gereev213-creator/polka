"""Сопоставление идёт по всем описательным полям объявления, а не только по названию."""
import os, re, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

i = SRC.index('_extra_parts = []')
seg = SRC[i:i + 900]

fields = ['size', 'condition', 'gender', 'photo_tags', 'address', 'seller_name', 'search_index']
checks = [("заголовок в тексте", 'join([title' in seg)]
for f in fields:
    checks.append((f"поле {f} участвует", f"'{f}'" in seg))
checks += [
    ("описание участвует", '_desc_text' in seg),
    ("категория не подмешивается", "'category'" not in seg),
    ("решение принимается по объединённому тексту",
     're.escape(str(word)) + r\'(?![0-9])\', hay)' in SRC),
]

ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nсопоставление по всем источникам: на месте' if ok else '\nесть пропуски')
sys.exit(0 if ok else 1)
