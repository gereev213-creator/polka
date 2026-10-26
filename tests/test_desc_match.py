"""Отбор по описанию: слова критерия ищутся и в описании объявления."""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

checks = [
    ("настройка hunt.match_description", "'hunt.match_description'" in SRC),
    ("описание участвует в поиске", "_desc_text" in SRC and "' '.join([title" in SRC),
    # Проверка слов теперь сравнивает без апострофов (Levi's = levis),
    # поэтому в исходнике два условия, а не одно.
    ("слова ищутся в объединённом тексте",
     'v in hay' in SRC and '_hay_ap' in SRC),
    ("числа ищутся там же",
     "re.escape(str(word)) + r'(?![0-9])', hay)" in SRC),
    ("без описания поиск идёт по заголовку",
     '_desc_text = str(ad.get' in SRC and 'if _match_desc' in SRC),
    ("мусор и аксессуары по-прежнему по заголовку",
     'hunt_junk_word(title_raw, query)' in SRC),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nотбор по описанию: на месте' if ok else '\nотбор: есть ошибки')
sys.exit(0 if ok else 1)
