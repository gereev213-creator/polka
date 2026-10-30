"""Критерий из ссылки проверяет слова запроса так же, как обычный.

Раньше ссылка давала полное доверие: любой лот из открытой страницы
считался находкой. Когда Авито блокирует поиск по q=, сборщик откатывается
на весь раздел — и в находки шёл мусор («Платье вечернее» по «фен dyson»).
"""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

i = SRC.index('def evaluate_ad(')
j = SRC.index('\ndef ', i + 10)
body = SRC[i:j]

checks = [
    ("нет безусловного доверия по filter_url",
     "if str(crit.get('filter_url') or '').startswith('http')" not in body),
    ("нет раннего решения direct_link",
     "return Decision(True, 'direct_link'" not in body),
    ("слова берём из search_q", "crit.get('search_q')" in body),
    ("проверка слов осталась", "_query_words_required" in body),
    ("страховка «ни одного слова» на месте", "нет ни одного" in body.lower() or "_any_word" in body),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nссылка проверяется словами: на месте' if ok else '\nссылка проверяется словами: есть пропуски')
sys.exit(0 if ok else 1)
