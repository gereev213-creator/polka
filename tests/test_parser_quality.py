"""Парсер не пропускает мусор и не долбит Авито запросами.

Проверки по исходникам: модуль бота при импорте инициализирует базу и
требует переменные окружения, поэтому проверяем правила в коде.
"""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BOT = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
COL = open(os.path.join(ROOT, 'collector', 'collect.py'), encoding='utf-8').read()

i = BOT.index('def evaluate_ad(')
j = BOT.index('\ndef ', i + 10)
ev = BOT[i:j]

checks = [
    # мусор: страховка «ни одного слова запроса»
    ('страховка по словам в отборе', '_any_word' in ev),
    ('слова для ссылок берутся из search_q', "crit.get('search_q')" in ev),
    ('нет доверия ссылке без проверки', "return Decision(True, 'direct_link'" not in ev),
    # 429: пауза между запросами и одна попытка
    ('пауза между запросами к Авито', 'MIN_REQUEST_GAP' in COL and '_respect_rate_limit' in COL),
    ('одна попытка при блоке', 'POLKA_MAX_ATTEMPTS' in COL),
    ('часовая квота запросов', 'collector.req_cap' in BOT),
    ('пауза 30 минут после блока', 'wait_min = 30' in BOT),
    ('длинный отдых после серии', 'wait_min = 180' in BOT),
    # лимит трафика
    ('дневной лимит трафика', 'collector.budget_mb_day' in BOT),
    # экономия: сжатие и круговой обход поисков
    ('сжатие запрашивается в запросе', "Accept-Encoding': 'br, gzip" in COL),
    ('один поиск проверяется не чаще часа', 'CHECK_INTERVAL_MIN' in COL),
    ('частота настраивается из админки', 'hunt.check_interval_min' in BOT),
]
fails = 0
for name, ok in checks:
    print(f"  {'✓' if ok else '✗'} {name}")
    if not ok:
        fails += 1
print('\nпарсер: правила качества и лимитов на месте' if not fails else '\nпарсер: есть пропуски')
sys.exit(0 if not fails else 1)
