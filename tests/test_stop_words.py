"""Тесты этапа D2: стоп-слова по границам слов, два списка, отрицания.

Таблица кейсов из промта: чип, клип, оптика, Optima, «iPhone 13 + зарядка»,
«не было ремонта», «корпус для ПК», «электронная книга», «реплика Nike».

Запуск: python3 tests/test_stop_words.py
"""
import os
import re
import sys
from typing import Dict, List, Optional, NamedTuple

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'evaluate_ad', '_condition_ok', '_query_alt_numbers', '_query_words_required',
          'query_word_variants', '_query_word_variants_orig', '_requirement_excludes',
          'HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START', 'HUNT_CONDITION_WORDS',
          'HUNT_NEGATION_WORDS', 'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_SHOP_MARKERS',
          'HUNT_ACCESSORY_WORDS', 'HUNT_TITLE_START_JUNK', '_hunt_word_pattern',
          'HUNT_RE_JUNK_ANYWHERE', 'HUNT_RE_JUNK_START', 'HUNT_RE_CONDITION',
          'HUNT_RE_NEGATION', 'HUNT_RE_SHOP', 'HUNT_RE_SHOP_MATCH', '_hunt_asked_stems',
          '_hunt_marker_asked', 'hunt_junk_word', 'hunt_junk_start_word',
          'hunt_condition_word', 'hunt_shop_in_name',
          'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS', 'HUNT_REPLICA_MARKERS',
          'HUNT_STOP_WORDS', 'QUERY_SYNONYMS', 'QUALIFIER_RU', 'HUNT_MODEL_QUALIFIERS',
          'HUNT_TITLE_START_JUNK', 'HUNT_FRESH_HOURS', 'HUNT_ALLOW_UNDATED',
          'HUNT_MIN_PRICE_SHARE')


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


ns = {'os': os, 're': re, 'NamedTuple': NamedTuple, 'Dict': Dict, 'List': List,
      'Optional': Optional, 'Tuple': tuple, 'Any': object}
picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS:
        picked.append((n, '\n'.join(chunk)))
found = {n for n, _ in picked}
missing = [n for n in set(TOKENS) if n not in found]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

junk_any = ns['hunt_junk_word']
junk_start = ns['hunt_junk_start_word']
condition = ns['hunt_condition_word']
shop_name = ns['hunt_shop_in_name']
evaluate = ns['evaluate_ad']
ok = 0

# ── 1. «Оптика», «Optima», «Чип», «Клип» — не магазин (дефект 3.2)
assert shop_name('Оптика') == '', shop_name('Оптика')
assert shop_name('Optima') == '', shop_name('Optima')
assert shop_name('Чип и Дип') == '', shop_name('Чип и Дип')
assert shop_name('Клип') == '', shop_name('Клип')
assert shop_name('ОПТ Техника') == 'опт', shop_name('ОПТ Техника')
assert shop_name('ИП Иванов') == 'ип', shop_name('ИП Иванов')
assert shop_name('ООО Ромашка') == 'ооо', shop_name('ООО Ромашка')
assert shop_name('Интернет-магазин Техно') == 'магазин', shop_name('Интернет-магазин Техно')
ok += 1
print('1) «Оптика»/«Optima»/«Чип»/«Клип» — не магазин; ОПТ, ИП, ООО, магазин — магазин')

# ── 2. Аксессуар только в начале заголовка
assert junk_start('Чехол для iPhone 13', '') == 'чехол', junk_start('Чехол для iPhone 13', '')
assert junk_start('iPhone 13 + чехол и зарядка', '') == '', junk_start('iPhone 13 + чехол', '')
assert junk_any('iPhone 13, чехол в подарок', '') == '', junk_any('iPhone 13, чехол в подарок', '')
assert junk_start('Кабель для iPhone 13', '') == 'кабель', junk_start('Кабель для iPhone 13', '')
assert junk_any('iPhone 13, копия Apple', '') == 'копия', junk_any('iPhone 13, копия')
assert junk_start('Электронная книга Kindle', '') == '', junk_start('Электронная книга Kindle', '')
assert junk_any('Электронная книга Kindle', '') == '', junk_any('Электронная книга Kindle', '')
# «Корпус для ПК»: если человек ИЩЕТ корпус — не мусор, иначе мусор
assert junk_start('Корпус для ПК', 'корпус для пк') == '', junk_start('Корпус для ПК', 'корпус')
assert junk_start('Корпус для ПК', 'iphone 13') == 'корпус', junk_start('Корпус для ПК', 'iphone')
ok += 1
print('2) «iPhone 13 + чехол» проходит, «Чехол для iPhone» — нет, «электронная книга» — не мусор')

# ── 3. Отрицания: «не было ремонта» — не признак плохого состояния
assert condition('Продаю iPhone, не было ремонта') == '', condition('не было ремонта')
assert condition('Телефон без дефектов и царапин') == '', condition('без дефектов')
assert condition('Не копия, оригинал') == '', condition('Не копия, оригинал')
assert condition('Телефон требует ремонта').startswith('ремонт'), condition('требует ремонта')
assert condition('Есть дефекты корпуса').startswith('дефект'), condition('есть дефекты')
assert condition('Разбит экран') .startswith('разбит'), condition('разбит экран')
ok += 1
print('3) отрицания: «не было ремонта», «без дефектов», «не копия» проходят')

# ── 4. Реплика — отдельная причина
assert junk_any('Реплика Nike Air', '') == 'реплика', junk_any('Реплика Nike', '')


def ad(**kw):
    base = {'id': 1, 'title': 'iPhone 13 128', 'price': 40000, 'city': 'Ижевск',
            'category': 'Электроника', 'published_hours_ago': 3,
            'photos': '["https://x/1.jpg"]', 'description': '', 'seller_type': ''}
    base.update(kw)
    return base


def crit(**kw):
    base = {'id': 1, 'user_id': 1, 'query': 'iphone 13', 'mode': 'any', 'min_discount': 15,
            'max_price': 0, 'min_price': 0, 'max_hours': 0, 'with_photo': 0,
            'condition': '', 'category': '', 'city': '', 'requirements': '',
            'median_price': 50000, 'sample_size': 20}
    base.update(kw)
    return base


d = evaluate(ad(title='iPhone 13 реплика'), crit())
assert (not d.ok) and d.reason == 'replica', d
print('4) «iPhone 13 реплика» → отказ с причиной replica (а не title_words)')

# ── 5. Те же кейсы через evaluate_ad (то, что раньше молча отсеивалось)
cases_ok = [
    ('iPhone 13, чехол в подарок', 'iphone 13'),
    ('iPhone 13 + зарядка', 'iphone 13'),
    ('Электронная книга Kindle', 'kindle'),
]
for title, query in cases_ok:
    d = evaluate(ad(title=title), crit(query=query))
    assert d.ok, (title, d)
d = evaluate(ad(title='iPhone 13', description='Продаю, не было ремонта'), crit())
assert d.ok, d
cases_bad = [
    ('Чехол для iPhone 13', 'accessory'),
    ('Кабель для iPhone 13', 'accessory'),
    ('iPhone 13 реплика', 'replica'),
]
for title, reason in cases_bad:
    d = evaluate(ad(title=title), crit())
    assert (not d.ok) and d.reason == reason, (title, d)
d = evaluate(ad(title='iPhone 13', description='Требует ремонта, экран разбит'), crit())
assert (not d.ok) and d.reason.startswith('condition_bad'), d
ok += 1
print('5) evaluate_ad: здоровые объявления проходят, мусор и реплики — с причиной')

print(f'\nD2: {ok} групп проверок, все пройдены')
