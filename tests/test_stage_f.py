"""Тесты этапа F: категории, принадлежности, состояние, АКБ, требования.

Запуск: python3 tests/test_stage_f.py
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Optional, NamedTuple
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'evaluate_ad', '_condition_ok', '_query_alt_numbers', '_query_words_required',
          'query_word_variants', '_query_word_variants_orig', '_requirement_excludes',
          'HUNT_ACCESSORY_WORDS', 'HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START', 'HUNT_CONDITION_WORDS',
          'HUNT_NEGATION_WORDS', 'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_RE_JUNK_ANYWHERE',
          'HUNT_RE_JUNK_START', 'HUNT_RE_CONDITION', 'HUNT_RE_NEGATION', 'HUNT_RE_SHOP',
          'HUNT_RE_SHOP_MATCH', '_hunt_word_pattern', '_hunt_asked_stems', '_hunt_marker_asked',
          'hunt_junk_word', 'hunt_junk_start_word', 'hunt_condition_word', 'hunt_shop_in_name',
          'HUNT_ACCESSORY_TITLE_WORDS', 'HUNT_ACCESSORY_CATEGORY_HINTS', '_CONDITION_RANK',
          '_CONDITION_PARTS', '_CONDITION_BROKEN', '_CONDITION_WORN', '_CONDITION_EXCELLENT',
          '_CONDITION_GOOD', '_CONDITION_NEW', '_negated_window', 'hunt_defect_phrase', 'HUNT_DEFECT_PHRASES', 'classify_condition',
          'extract_battery_percent', 'requirements_json_from_text', '_crit_requirements_json',
          '_title_has_accessory', '_accessory_before_model', '_OPENED_MARKERS',
          '_opened_markers_hit', '_ad_hours_ago', '_hours_since', '_safe_isoparse',
          'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS', 'HUNT_REPLICA_MARKERS', 'HUNT_SHOP_MARKERS',
          'HUNT_STOP_WORDS', 'HUNT_STRICT_MODEL_HINTS', '_hunt_extra_qualifier', '_crit_excluded', '_crit_exclude_words', 'CATEGORY_BY_WORD', '_query_subject_word', 'HUNT_MODIFIER_WORDS', 'query_word_variants', 'QUERY_SYNONYMS', 'QUALIFIER_RU', 'HUNT_MODEL_QUALIFIERS',
          'HUNT_TITLE_START_JUNK', 'HUNT_FRESH_HOURS', 'HUNT_ALLOW_UNDATED',
          'HUNT_MIN_PRICE_SHARE', 'HUNT_SUSPECT_DISCOUNT')


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
    m = re.match(r'(?:async\s+def|class|def)\s+([A-Za-z_][A-Za-z0-9_]*)', chunk[0])
    if m:
        return m.group(1)
    m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=', chunk[0])
    return m.group(1) if m else ''


ns = {'os': os, 'json': json, 're': re, 'NamedTuple': NamedTuple, 'Dict': Dict,
      'List': List, 'Optional': Optional, 'Tuple': tuple, 'Any': object,
      'datetime': datetime, 'timedelta': timedelta, 'ZoneInfo': ZoneInfo,
      'get_moscow_time': lambda: datetime(2026, 10, 14, 12, 0, 0, tzinfo=ZoneInfo('Europe/Moscow'))}
picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS:
        picked.append((n, '\n'.join(chunk)))
found = {n for n, _ in picked}
missing = [n for n in TOKENS if n not in found]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

evaluate = ns['evaluate_ad']
classify = ns['classify_condition']
battery = ns['extract_battery_percent']
rj_from_text = ns['requirements_json_from_text']


def ad(**kw):
    base = {'id': 1, 'title': 'iPhone 14 Pro 128', 'price': 50000, 'city': 'Ижевск',
            'category': 'Электроника', 'published_hours_ago': 3,
            'photos': '["https://x/1.jpg"]', 'description': '', 'seller_type': ''}
    base.update(kw)
    return base


def crit(**kw):
    base = {'id': 1, 'user_id': 1, 'query': 'iphone 14 pro', 'mode': 'any', 'min_discount': 15,
            'max_price': 0, 'min_price': 0, 'max_hours': 0, 'with_photo': 0,
            'condition': '', 'category': '', 'city': '', 'requirements': '',
            'requirements_json': {}, 'median_price': 70000, 'sample_size': 20}
    base.update(kw)
    return base


ok = 0

# ── 1. Принадлежности по позиции в названии
# «Чехол» в начале — legacy-причина accessory; «Защита…» не в начале, но ПЕРЕД
# моделью — новая, точная причина accessory_title
assert evaluate(ad(title='Чехол iPhone 14 Pro', price=1500), crit()).reason == 'accessory'
assert evaluate(ad(title='Защита на камеру iPhone 14 Pro', price=900), crit()).reason == 'accessory_title'
assert evaluate(ad(title='iPhone 14 Pro 128 + чехол', price=50000), crit()).ok, 'товар с чехлом в подарок должен пройти'
assert evaluate(ad(title='iPhone 14 Pro 128', price=50000), crit()).ok
ok += 1
print('1) «Чехол/Защита … iPhone 14 Pro» — принадлежность; «iPhone 14 Pro + чехол» — товар')

# ── 2. Категория аксессуаров
assert evaluate(ad(title='iPhone 14 Pro 128', category='Аксессуары для телефонов'),
                crit()).reason == 'accessory_category'
ok += 1
print('2) категория «Аксессуары…» у объявления, а критерий её не просит → accessory_category')

# ── 3. Состояние: классификатор
assert classify('iPhone 14 Pro, разбит экран', '')[0] == 'broken', classify('iPhone 14 Pro, разбит экран', '')
assert classify('iPhone 14 Pro на запчасти', '')[0] == 'parts'
assert classify('iPhone 14 Pro 128, идеальное состояние', '')[0] == 'excellent'
assert classify('iPhone 14 Pro 128', 'Состояние хорошее, без царапин')[0] == 'excellent'
assert classify('iPhone 14 Pro, потёртости и царапины', '')[0] == 'worn'
assert classify('iPhone новый, запечатан', '')[0] == 'new'
assert classify('iPhone 14 Pro', '')[1] == 'low'
assert classify('iPhone 14 Pro', 'без дефектов, пользовался аккуратно')[1] == 'high'
ok += 1
print('3) классификатор состояния: broken/parts/excellent/worn/new + confidence')

# ── 4. АКБ
assert battery('iPhone 14 Pro, акб 87%', '') == 87
assert battery('', 'аккумулятор 92 %, батарея новая') == 92
assert battery('', 'здоровье батареи 80') == 80
assert battery('iPhone 14 Pro', '') is None
ok += 1
print('4) extract_battery_percent: 87/92/80 и None')

# ── 5. requirements_json из текста
rj = rj_from_text('хорошее состояние, АКБ от 80%, только оригинал, не вскрывался, с рук')
assert rj.get('condition_min') == 'good', rj
assert rj.get('battery_min') == 80, rj
assert rj.get('original_only') is True and rj.get('not_opened') is True and rj.get('private_only') is True, rj
ok += 1
print('5) текст требований → JSON: good, 80, оригинал, не вскрывался, с рук')

# ── 6. Требования применяются по описанию
rj = {'condition_min': 'good', 'battery_min': 80, 'not_opened': True, 'original_only': True}
# хороший лот проходит
d = evaluate(ad(description='Состояние хорошее, акб 88%, не вскрывался'), crit(requirements_json=rj))
assert d.ok, d
# акб ниже — отказ
d = evaluate(ad(description='акб 75%'), crit(requirements_json={'battery_min': 80}))
assert (not d.ok) and (d.reason == 'battery_low'
        or str(d.reason).startswith('defect:')), d
# вскрывался — отказ
d = evaluate(ad(description='менялся экран'), crit(requirements_json={'not_opened': True}))
assert (not d.ok) and (d.reason == 'opened'
        or str(d.reason).startswith('defect:')), d
# состояние ниже — отказ
d = evaluate(ad(description='на запчасти'), crit(requirements_json={'condition_min': 'good'}))
assert (not d.ok) and (d.reason == 'condition_below'
        or str(d.reason).startswith('defect:')), d
ok += 1
print('6) condition_min/battery_min/not_opened читаются из описания (battery_low/opened/condition_below)')

# ── 7. Без описания — не отказ, а пометка unverified
d = evaluate(ad(description=''), crit(requirements_json={'battery_min': 80, 'condition_min': 'good'}))
assert d.ok and d.unverified is True, d
ok += 1
print('7) без описания структурные требования не применяются, но лот помечается unverified')

# ── 8. Принадлежность по цене
d = evaluate(ad(title='iPhone 14 Pro, чехол', price=9000), crit())
assert (not d.ok) and d.reason == 'accessory_price', d
ok += 1
print('8) принадлежность дешевле 25% медианы → accessory_price')

print('\nF: все проверки пройдены')
