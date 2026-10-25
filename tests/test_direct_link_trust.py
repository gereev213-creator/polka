"""Критерий из ссылки доверяет Авито: наши проверки по словам не применяются."""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

i = SRC.index('def evaluate_ad(')
j = SRC.index('\ndef ', i + 10)
body = SRC[i:j]

checks = [
    ("ранний выход по filter_url", "if str(crit.get('filter_url') or '').startswith('http')" in body),
    ("решение помечено direct_link", "'direct_link'" in body),
    ("подпись «по фильтрам Авито»", "'по фильтрам Авито'" in body),
    # цена и фото проверяются ДО выхода — значит мусор по цене всё равно отсечётся
    # теперь доверие ссылке стоит в начале, а цена проверяется внутри него
    ("доверие в начале проверки",
     body.index("filter_url") < body.index("category_mismatch") if "category_mismatch" in body else True),
    ("фото проверяется внутри выхода", "return no('no_photo')" in body[body.index("filter_url"):]),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nдоверие ссылке: правила на месте' if ok else '\nдоверие ссылке: есть пропуски')
sys.exit(0 if ok else 1)
