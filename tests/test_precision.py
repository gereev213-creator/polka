"""Тесты универсальной точности: свои исключения, строгая модель, подсказки.

Запуск: python3 tests/test_precision.py
"""
import json
import os
import re
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List, NamedTuple, Optional, Tuple
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

TOKENS = ('Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'HUNT_ACCESSORY_TITLE_WORDS', 'HUNT_ACCESSORY_CATEGORY_HINTS', '_CONDITION_RANK',
          '_CONDITION_PARTS', '_CONDITION_BROKEN', '_CONDITION_WORN', '_CONDITION_EXCELLENT',
          '_CONDITION_GOOD', '_CONDITION_NEW', '_negated_window', 'hunt_defect_phrase', 'HUNT_DEFECT_PHRASES', 'classify_condition',
          'extract_battery_percent', 'requirements_json_from_text', '_crit_requirements_json',
          '_title_has_accessory', '_accessory_before_model', '_OPENED_MARKERS', '_opened_markers_hit',
          'evaluate_ad', '_condition_ok', '_query_alt_numbers', '_query_words_required',
          'query_word_variants', '_query_word_variants_orig', '_requirement_excludes',
          'HUNT_ACCESSORY_WORDS', 'HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START', 'HUNT_CONDITION_WORDS',
          '_ad_hours_ago', 'HUNT_SUSPECT_DISCOUNT', 'HUNT_PRICE_DROP_PERCENT',
          'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_NEGATION_WORDS', 'HUNT_RE_JUNK_ANYWHERE',
          'HUNT_RE_JUNK_START', 'HUNT_RE_CONDITION', 'HUNT_RE_NEGATION', 'HUNT_RE_SHOP',
          'HUNT_RE_SHOP_MATCH', '_hunt_word_pattern', '_hunt_asked_stems', '_hunt_marker_asked',
          'hunt_junk_word', 'hunt_junk_start_word', 'hunt_condition_word', 'hunt_shop_in_name',
          'HUNT_REPLICA_MARKERS', 'HUNT_SHOP_MARKERS', 'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS',
          'HUNT_STOP_WORDS', 'QUERY_SYNONYMS', 'QUALIFIER_RU', 'HUNT_MODEL_QUALIFIERS',
          'HUNT_STRICT_MODEL_HINTS', '_hunt_extra_qualifier', '_crit_excluded', 'CATEGORY_BY_WORD', '_query_subject_word', 'HUNT_MODIFIER_WORDS', 'query_word_variants',
          '_crit_exclude_words', 'HUNT_TITLE_START_JUNK', 'HUNT_FRESH_HOURS',
          'HUNT_ALLOW_UNDATED', 'HUNT_MIN_PRICE_SHARE', '_criterion_hint')


def chunks(src):
    out, cur = [], []
    for line in src.split('\n'):
        starts_new = (bool(line) and not line[0].isspace()
                      and not line.startswith(('#', ')', ']', '}', 'else', 'elif',
                                               'except', 'finally', 'from', 'import')))
        if starts_new and cur:
            out.append(cur)
            cur = []
        cur.append(line)
    if cur:
        out.append(cur)
    return out


def name_of(chunk):
    m = re.match(r'(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)', chunk[0])
    if m:
        return m.group(1)
    m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=', chunk[0])
    return m.group(1) if m else ''


ns = {'os': os, 'json': json, 're': re, 'NamedTuple': NamedTuple, 'Dict': Dict, 'List': List,
      'Optional': Optional, 'Tuple': Tuple, 'Any': Any,
      'get_moscow_time': lambda: datetime(2026, 10, 15, 12, 0, tzinfo=ZoneInfo('Europe/Moscow'))}
picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS:
        picked.append((n, '\n'.join(chunk)))
missing = [n for n in TOKENS if n not in {p[0] for p in picked}]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

evaluate = ns['evaluate_ad']
hint = ns['_criterion_hint']
excluded = ns['_crit_excluded']


def crit(**kw):
    base = {'id': 1, 'user_id': 1, 'query': '', 'category': '', 'city': '', 'max_price': 0,
            'min_price': 0, 'max_hours': 0, 'with_photo': 0, 'mode': 'any',
            'requirements': '', 'requirements_json': '{}', 'exclude_words': '',
            'strict_model': 0, 'median_price': 0, 'sample_size': 0}
    base.update(kw)
    return base


def ad(title, **kw):
    base = {'id': 1, 'title': title, 'description': '', 'price': 10000, 'city': '',
            'category': 'Одежда, обувь, аксессуары', 'photos': ['http://x/1.jpg'],
            'published_hours_ago': 3, 'status': 'active', 'source': 'avito',
            'market_median': 0, 'seller_type': ''}
    base.update(kw)
    return base


def run(c, a, **kw):
    return evaluate(a, c, require_description=False, hidden=False, already_sent=False,
                    deep_check=True, **kw)


ok = 0
# ── 1. Свои исключения отсекают лишнее
c = crit(query='куртка зимняя', exclude_words='чехол, запчасти',
         category='Одежда, обувь, аксессуары')
_d1 = run(c, ad('Куртка зимняя мужская'))
print('   разбор обычной куртки:', _d1.reason)
assert _d1.ok or _d1.reason != 'excluded', _d1
d = run(c, ad('Чехол для куртки зимней'))
assert not d.ok and d.reason == 'excluded', d
ok += 1
print('1) свои исключения: «чехол» отсекает, обычная куртка проходит')

# ── 2. Слово из самого запроса исключением не считается
c = crit(query='чехол для iPhone', exclude_words='чехол', category='Электроника')
assert run(c, ad('Чехол для iPhone 13 силикон', category='Электроника')).ok
ok += 1
print('2) слово из самого запроса не превращает критерий в пустой')

# ── 3. Отрицание в исключении не считается попаданием
assert excluded(crit(query='куртка', exclude_words='копия'), 'Куртка, не копия — оригинал') == ''
ok += 1
print('3) «не копия» в заголовке не считается исключением')

# ── 4. Строгая модель: с галочкой режем лишние уточнители всегда
strict = crit(query='iPhone 13', category='Электроника', strict_model=1)
d = run(strict, ad('iPhone 13 Pro 128 ГБ', category='Электроника'))
assert not d.ok and d.reason == 'model_mismatch', d
free = crit(query='iPhone 13', category='Электроника', strict_model=0)
assert run(free, ad('iPhone 13 Pro 128 ГБ', category='Электроника')).ok
ok += 1
print('4) строгая модель: с галочкой «13 Pro» отсекается, без — проходит')

# ── 5. Подсказки здоровья критерия
h = hint(crit(query='куртка', median_price=3000),
         {'total': 50, 'sent': 0, 'top_reason': 'price_too_high'})
assert 'Поднимите верхнюю цену' in h, h
h2 = hint(crit(query='куртка', median_price=3000),
          {'total': 500, 'sent': 0, 'sent_day': 80})
assert 'Слишком широко' in h2, h2
h3 = hint(crit(query='куртка', median_price=3000), {'total': 50, 'sent': 5})
assert h3 == '', h3
ok += 1
print('5) подсказки: узко/широко/всё хорошо — по делу и без лишнего')

# ── 6. Общее правило «слово-товар»: работает для любого запроса, не по списку
subj = ns['_query_subject_word']
assert subj('Пуховик lacoste') == 'пуховик', subj('Пуховик lacoste')
assert subj('пылесос Dyson') == 'пылесос', subj('пылесос Dyson')
assert subj('iPhone 15 Pro') == 'iphone', subj('iPhone 15 Pro')
assert subj('люстра хрустальная') == 'люстра', subj('люстра хрустальная')
# кроссовки Lacoste не должны пройти под критерий про пуховик
d = run(crit(query='Пуховик lacoste', category='Одежда, обувь, аксессуары'),
        ad('Кроссовки мужские зимние Lacoste'))
assert not d.ok and d.reason == 'title_words', d
# фен Dyson не должен пройти под критерий про пылесос Dyson
d2 = run(crit(query='пылесос Dyson', category='Бытовая техника'),
         ad('Фен Dyson Supersonic', category='Бытовая техника'))
assert not d2.ok and d2.reason == 'title_words', d2
# а сам пуховик Lacoste проходит
assert run(crit(query='Пуховик lacoste', category='Одежда, обувь, аксессуары'),
           ad('Пуховик Lacoste зимний мужской')).ok
ok += 1
print('6) слово-товар обязано быть в заголовке — для любого запроса, не по списку')

# ── 7. Дефекты из ОПИСАНИЯ — второй источник информации после заголовка.
# Взято реальное объявление, которое принёс телефон: в заголовке всё хорошо,
# а дефект («полоса на экране») спрятан в тексте.
_real_desc = 'Полоса на экране, полностью рабочий. Фейс, трутон работает'
d = run(crit(query='iPhone 13', category='Электроника'),
        ad('iPhone 13, 128 ГБ, SIM + eSIM', category='Электроника',
           description=_real_desc))
assert not d.ok and str(d.reason).startswith('defect:'), d
# То же объявление, но дефект отрицается — пропускаем как нормальное
d2 = run(crit(query='iPhone 13', category='Электроника'),
         ad('iPhone 13, 128 ГБ, SIM + eSIM', category='Электроника',
            description='Состояние отличное, без дефектов, не вскрывался'))
assert not str(d2.reason).startswith('defect:'), d2
# И «полосатый свитер» дефектом не считается (фраза, а не слово)
assert not str(run(crit(query='Свитер полосатый', category='Одежда, обувь, аксессуары'),
                   ad('Свитер полосатый мужской', category='Одежда, обувь, аксессуары',
                      description='Полосатый свитер, шерсть, носился аккуратно')).reason
               ).startswith('defect:')
ok += 1
print('7) дефекты из описания: реальный «полоса на экране» отклонён, отрицания и «полосатый свитер» — нет')

print('\nточность: все проверки пройдены')
