"""Ссылка с Авито — единственный фильтр: открыли выдачу, увидели новое, отправили.

Раньше поверх ссылки включались наши проверки слов/города/цены, а сборщик
при блокировке откатывался на широкий раздел — из-за этого по ссылке на
iPhone 17 Pro в ленту ушли 442 чужих лота (радиолы, бамперы). Теперь:
  • сборщик открывает РОВНО ссылку человека и сравнивает id с уже
    виденными (первый проход — снимок выдачи, без отправки);
  • сервер доверяет выданной площадке: слова, город и цена из ссылки
    повторно не проверяются;
  • чужие объявления к ссылочному критерию не примеряются вообще —
    партия приходит только со своим crit_ids.
"""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
COL = open(os.path.join(ROOT, 'collector', 'collect.py'), encoding='utf-8').read()

i = SRC.index('def evaluate_ad(')
j = SRC.index('\ndef ', i + 10)
body = SRC[i:j]

checks = [
    ("ссылка — готовое решение без слов/города/цены",
     "return Decision(True, 'ok', 'по ссылке')" in body),
    ("нет старого отсева по словам модели из пути",
     "_strong = [t for t in _toks" not in body),
    ("нет 10-минутного прогрева, который глушил находки",
     "no('warmup')" not in body),
    ("город не проверяется отдельной веткой для ссылки",
     "if (not _from_link) and _want_city" not in SRC),
    ("партия ссылки уходит со списком критериев",
     "payload['crit_ids'] = crit_ids" in COL),
    ("сервер примеряет партию только к её критериям",
     "hunt_matches_recompute(ad_ids=_all, crit_id=int(_cid))" in SRC),
    ("без партии ссылочные критерии не трогаются",
     "crits = [c for c in crits if not int(c.get('from_link') or 0)]" in SRC),
    ("новый ссылочный поиск не пересчитывает старую базу",
     'ссылочный — находки придёт сборщик' in SRC),
    ("сборщик открывает точный адрес, а не собранный из слов",
     '_browser_link_url' in COL),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nссылка доверенная и изолированная: на месте' if ok
      else '\nссылка: есть пропуски')
sys.exit(0 if ok else 1)
