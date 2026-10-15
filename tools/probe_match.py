"""Проба сопоставления на живых парах: что находится, а что теряется.

Проверяет критерии на реальных заголовках Авито (без сети) — так видно
пробелы: лишние находки и потерянные. Запуск:

    cd amvera-upload && python3 tools/probe_match.py

Ожидаемый результат: «расхождений: 1 из 16» — это случай, где в
заголовке продавца нет размера, и он неисправим в принципе.
"""
import json
import os
import re
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

TOKENS = ('Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'HUNT_ACCESSORY_TITLE_WORDS', 'HUNT_ACCESSORY_CATEGORY_HINTS', '_CONDITION_RANK',
          '_CONDITION_PARTS', '_CONDITION_BROKEN', '_CONDITION_WORN', '_CONDITION_EXCELLENT',
          '_CONDITION_GOOD', '_CONDITION_NEW', '_negated_window', 'classify_condition',
          'extract_battery_percent', 'requirements_json_from_text', '_crit_requirements_json',
          '_title_has_accessory', '_accessory_before_model', '_OPENED_MARKERS', '_opened_markers_hit',
          'evaluate_ad', '_condition_ok', '_query_alt_numbers', '_query_words_required',
          'query_word_variants', '_query_word_variants_orig', '_requirement_excludes', 'HUNT_ACCESSORY_WORDS',
          'HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START', 'HUNT_CONDITION_WORDS',
          '_ad_hours_ago', 'HUNT_SUSPECT_DISCOUNT', 'HUNT_PRICE_DROP_PERCENT',
          'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_NEGATION_WORDS', 'HUNT_RE_JUNK_ANYWHERE',
          'HUNT_RE_JUNK_START', 'HUNT_RE_CONDITION', 'HUNT_RE_NEGATION', 'HUNT_RE_SHOP',
          'HUNT_RE_SHOP_MATCH', '_hunt_word_pattern', '_hunt_asked_stems', '_hunt_marker_asked',
          'hunt_junk_word', 'hunt_junk_start_word', 'hunt_condition_word', 'hunt_shop_in_name',
          'HUNT_REPLICA_MARKERS', 'HUNT_SHOP_MARKERS', 'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS',
          'HUNT_STOP_WORDS', 'QUERY_SYNONYMS', 'QUALIFIER_RU', 'HUNT_MODEL_QUALIFIERS',
          'HUNT_STRICT_MODEL_HINTS', '_hunt_extra_qualifier',
          'HUNT_TITLE_START_JUNK', 'HUNT_FRESH_HOURS', 'HUNT_ALLOW_UNDATED', 'HUNT_MIN_PRICE_SHARE')


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
    head = chunk[0]
    m = re.match(r'(?:class|def)\s+([A-Za-z_][A-Za-z0-9_]*)', head)
    if m:
        return m.group(1)
    m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=', head)
    return m.group(1) if m else ''


ns = {'os': os, 'json': json, 're': re, 'NamedTuple': NamedTuple, 'Dict': Dict, 'List': List,
      'Optional': Optional, 'Tuple': Tuple, 'Any': Any}
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

# (запрос критерия, заголовок объявления, чего ждём)
CASES = [
    ('айфон 13', 'iPhone 13 Pro, 128 ГБ, SIM + eSIM', 'найти'),
    ('iPhone 15 Про', 'iPhone 15 Pro 256Gb', 'найти'),
    ('зип кофта мальчика 158', 'Зип худи Bape Tiger Shark камуфляж S-XXL', 'найти'),
    ('куртка мальчик 158', 'Куртка детская зимняя 158 см', 'найти'),
    ('ботинки Columbia 39', 'Ботинки Columbia зимние 39', 'найти'),
    ('пуховик lacoste', 'Пуховик Lacoste мужской', 'найти'),
    ('кроссовки найк 43', 'Кроссовки Nike Air размер 43', 'найти'),
    ('чехол для iPhone 15 Pro', 'Чехол для iPhone 15 Pro Max силикон', 'НЕ найти'),
    ('iPhone 15 Pro', 'iPhone 15 Pro Max 256 ГБ', 'НЕ найти'),
    ('пуховик', 'Пуховик на запчасти', 'НЕ найти'),
    ('куртка', 'Куртка детская, реплика', 'НЕ найти'),
    ('наушники', 'Наушники беспроводные', 'найти'),
    ('наушники', 'Ушки для наушников (амбушюры)', 'НЕ найти'),
    ('телефон samsung', 'Смартфон Samsung Galaxy A54', 'найти'),
    ('пальто', 'Пальто женское', 'найти'),
    ('стол', 'Стол компьютерный', 'найти'),
]

req = ns['_query_words_required']
var = ns['query_word_variants']
for _q in ('куртка мальчик 158', 'зип кофта мальчика 158', 'айфон 13'):
    _w = req(_q)
    print(f'«{_q}» → обязательные: {_w}')
    for _x in _w:
        print(f'    {_x}: {var(_x)}')
print()
print()
print(f"{'критерий':28} {'объявление':42} ждём   итог")
print('-' * 96)
bad = 0
for query, title, expect in CASES:
    tech = any(w in query.lower() for w in ('айфон', 'iphone', 'samsung', 'samsung', 'телефон',
                                           'чехол', 'наушники', 'xiaomi', 'samsung'))
    cat = 'Электроника' if tech else 'Одежда, обувь, аксессуары'
    crit = {'id': 1, 'user_id': 1, 'query': query, 'category': cat, 'city': '',
            'max_price': 0, 'min_price': 0, 'max_hours': 0, 'with_photo': 0,
            'mode': 'any', 'requirements': '', 'requirements_json': {}}
    ad = {'id': 1, 'title': title, 'description': '', 'price': 10000, 'city': '',
          'category': cat, 'photos': ['http://x/1.jpg'], 'published_hours_ago': 3,
          'status': 'active', 'source': 'avito', 'market_median': 0, 'seller_type': ''}
    d = evaluate(ad, crit, require_description=False, hidden=False, already_sent=False,
                 deep_check=True)
    got = 'найти' if d.ok else 'НЕ найти'
    mark = 'ок' if got == expect else 'ПРОБЕЛ'
    if got != expect:
        bad += 1
    print(f'{query:28} {title[:40]:42} {expect:7} {got} ({d.reason}) {mark}')
print(f'\nрасхождений: {bad} из {len(CASES)}')
