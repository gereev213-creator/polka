"""Тесты этапа G: слотовый движок диалога с ИИ.

Проверяем детерминированное ядро: порядок вопросов без повторов, «любой» не
попадает в строку поиска, требования не дублируются, числа извлекаются.

Запуск: python3 tests/test_stage_g.py
"""
import json
import os
import re
import sys
from typing import Dict, List, Optional, NamedTuple

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('HUNT_DIALOG_SLOT_ORDER', 'HUNT_DIALOG_DEFAULT_ORDER', 'HUNT_SLOT_QUESTIONS',
          'HUNT_SLOT_OPTIONS', '_ANY_ANSWERS', '_CONDITION_SYNONYMS', '_dialog_copy',
          '_dialog_next_slot', '_dialog_apply_choice', '_dialog_apply_extract',
          '_dialog_item_word', '_dialog_query', '_dialog_requirements',
          '_dialog_slot_options', '_dialog_detect_category', '_dialog_extract_fallback')


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


ns = {'os': os, 'json': json, 're': re, 'Dict': Dict, 'List': List,
      'Optional': Optional, 'Tuple': tuple}
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

next_slot = ns['_dialog_next_slot']
apply_choice = ns['_dialog_apply_choice']
apply_extract = ns['_dialog_apply_extract']
query = ns['_dialog_query']
requirements = ns['_dialog_requirements']
detect = ns['_dialog_detect_category']
ok = 0

# ── 1. Категория по словам
assert detect(['iPhone', '14', 'Pro']) == 'telefony'
assert detect(['кроссовки', 'Nike']) == 'odezhda_obuv_aksessuary'
assert detect(['Toyota', 'Camry']) == 'avtomobili'
assert detect(['диван']) == ''
ok += 1
print('1) детектор категории: telefony/odezhda/avtomobili/пусто')

# ── 2. Порядок вопросов без повторов
d = {'item_words': ['iPhone', '14', 'Pro'], 'any': [], 'category': 'telefony'}
slots = []
for _ in range(8):
    s = next_slot(d, 'telefony')
    if not s:
        break
    assert s not in slots, f'повторный вопрос {s}'
    slots.append(s)
    d['any'].append(s)          # имитируем «любой»
assert slots == ['memory_or_size', 'condition_min', 'battery_min', 'max_price',
                 'original_only', 'private_only'], slots
ok += 1
print('2) порядок вопросов телефона: память → состояние → АКБ → цена → оригинал → с рук')

# ── 3. «любой» не попадает в query
d = {'item_words': ['iPhone', '14', 'Pro'], 'any': ['memory_or_size']}
d = apply_choice(d, 'condition_min', 'любой')
assert d['any'] == ['memory_or_size', 'condition_min'], d
assert query(d) == 'iPhone 14 Pro', query(d)
ok += 1
print('3) «любой» помечает слот и не попадает в строку поиска')

# ── 4. Числа и состояние из кнопок
d = apply_choice({'item_words': [], 'any': []}, 'battery_min', '80')
assert d['battery_min'] == 80, d
d2 = apply_choice({'item_words': [], 'any': []}, 'battery_min', '80%')
assert d2['battery_min'] == 80, d2
d3 = apply_choice({'item_words': [], 'any': []}, 'condition_min', 'хорошее')
assert d3['condition_min'] == 'good', d3
d4 = apply_choice({'item_words': [], 'any': []}, 'max_price', 'до 50 000')
assert d4['max_price'] == 50000, d4
ok += 1
print('4) кнопки: «80» и «80%» → 80, «хорошее» → good, «до 50 000» → 50000')

# ── 5. requirements_json без дублей
d = {'item_words': ['iPhone', '14', 'Pro'], 'condition_min': 'good',
     'battery_min': 80, 'original_only': True, 'private_only': True}
r = requirements(d)
assert r == {'condition_min': 'good', 'battery_min': 80,
             'original_only': True, 'private_only': True}, r
ok += 1
print('5) requirements_json собирается без дублей')

# ── 6. Полный диалог (как в G4): слотовый движок + извлечение
draft = {'item_words': [], 'any': [], 'category': ''}
turns = [
    # (message, extract от модели)
    ('14 айфон про', {'item_words': ['iPhone', '14', 'Pro']}),
    ('любой', {'answered_any': ['memory_or_size']}),
    ('хорошее', {'condition_min': 'good'}),
    ('от 80%', {'battery_min': 80}),
    ('до 50 тысяч', {'max_price': 50000}),
    ('оригинал', {'original_only': True}),
    ('с рук', {'private_only': True}),
]
seen_slots = []
for msg, extract in turns:
    prev = draft.get('_ask')
    draft = apply_extract(draft, extract)
    if prev and prev not in draft.get('any', []) and draft.get(prev) in (None, '', []):
        draft.setdefault('any', []).append(prev)
    if not draft.get('category'):
        draft['category'] = detect(draft.get('item_words') or [])
    draft['_ask'] = next_slot(draft, draft.get('category'))
    if draft['_ask']:
        seen_slots.append(draft['_ask'])
q = query(draft)
assert q == 'iPhone 14 Pro', q
assert 'любой' not in q and 'хорошее' not in q and '80' not in q and 'оригинал' not in q, q
r = requirements(draft)
assert r['battery_min'] == 80 and r['condition_min'] == 'good' \
    and r['original_only'] is True and r['private_only'] is True, r
assert len(seen_slots) == len(set(seen_slots)), seen_slots
ok += 1
print('6) полный диалог G4: query «iPhone 14 Pro», требования целы, вопросов без повторов')

# ── 7. пустое сообщение и «привет»
ex, say = ns['_dialog_extract_fallback']({'item_words': [], 'any': []}, 'привет')
assert ex.get('item_words') == ['привет'], ex   # товар не задан — слова уходят в item_words
# пустое сообщение без товара не должно ничего «добавить»
ex2, _ = ns['_dialog_extract_fallback']({'item_words': ['iPhone'], 'any': []}, '')
assert 'battery_min' not in ex2 and 'max_price' not in ex2, ex2
ok += 1
print('7) фолбэк извлечения: «привет» → слова товара, пустое сообщение не выдумывает числа')

print('\nG: все проверки пройдены')
