"""Тесты этапа B: evaluate_ad — одна чистая функция отбора.

Функция вырезается из настоящего polka_bot-9-3.py вместе со своими
помощниками (бот целиком не импортируется: ему нужны токен, база и
python-telegram-bot).

Запуск: python3 tests/test_evaluate_ad.py
"""
import json
import os
import re
import sys
from typing import Dict, List, Optional, NamedTuple

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('Decision', 'HUNT_REASON_LABELS', '_hunt_reason_label', '_hunt_needs_description',
          'HUNT_ACCESSORY_TITLE_WORDS', 'HUNT_ACCESSORY_CATEGORY_HINTS', '_CONDITION_RANK',
          '_CONDITION_PARTS', '_CONDITION_BROKEN', '_CONDITION_WORN', '_CONDITION_EXCELLENT',
          '_CONDITION_GOOD', '_CONDITION_NEW', '_negated_window', 'classify_condition',
          'extract_battery_percent', 'requirements_json_from_text', '_crit_requirements_json',
          '_title_has_accessory', '_accessory_before_model', '_OPENED_MARKERS', '_opened_markers_hit',
          'evaluate_ad', '_condition_ok', '_query_alt_numbers', '_query_words_required',
          'query_word_variants', '_requirement_excludes', 'HUNT_ACCESSORY_WORDS',
          'HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START', 'HUNT_CONDITION_WORDS',
          '_ad_hours_ago', 'HUNT_SUSPECT_DISCOUNT', 'HUNT_PRICE_DROP_PERCENT', 'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_JUNK_ANYWHERE', 'HUNT_NEGATION_WORDS', 'HUNT_MEDIAN_EXCLUDE_WORDS', 'HUNT_RE_JUNK_ANYWHERE', 'HUNT_RE_JUNK_START', 'HUNT_RE_CONDITION', 'HUNT_RE_NEGATION', 'HUNT_RE_SHOP', 'HUNT_RE_SHOP_MATCH', '_hunt_word_pattern', '_hunt_asked_stems', '_hunt_marker_asked', 'hunt_junk_word', 'hunt_junk_start_word', 'hunt_condition_word', 'hunt_shop_in_name',
          'HUNT_REPLICA_MARKERS', 'HUNT_SHOP_MARKERS', 'HUNT_NEW_MARKERS', 'HUNT_USED_MARKERS',
          'HUNT_STOP_WORDS', 'HUNT_STRICT_MODEL_HINTS', '_hunt_extra_qualifier', 'QUERY_SYNONYMS', 'QUALIFIER_RU',
          'HUNT_MODEL_QUALIFIERS', 'HUNT_TITLE_START_JUNK',
          '_query_word_variants_orig',
          'HUNT_FRESH_HOURS', 'HUNT_ALLOW_UNDATED', 'HUNT_MIN_PRICE_SHARE')


def chunks(src):
    """Режет файл на куски верхнего уровня: имя → текст."""
    out = []
    cur = []
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


ns = {'os': os, 'json': json, 're': re, 'NamedTuple': NamedTuple, 'Dict': Dict, 'List': List, 'Optional': Optional,
      'Tuple': tuple, 'Any': object}
# Исполняем куски в порядке файла: вторые определения (query_word_variants
# с русскими вариантами) должны перекрыть первые, а _query_word_variants_orig
# успеть связаться с первой версией.
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
Decision = ns['Decision']


def run(ad, crit, **kw):
    return evaluate(ad, crit, **kw)


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
            'median_price': None, 'sample_size': 0}
    base.update(kw)
    return base


ok = 0

# 1. Дата неизвестна и в критерии «свежесть» → пропускаем, но помечаем
d = run(ad(published_hours_ago=None), crit(max_hours=24))
assert d.ok and d.reason == 'date_unknown_ok', d
ok += 1
print('1) дата неизвестна + max_hours → ok, reason=date_unknown_ok')

# 2. Режим «только выгодные» без медианы → отказ с причиной
d = run(ad(), crit(mode='deal'))
assert (not d.ok) and d.reason == 'no_median', d
ok += 1
print('2) режим deal без медианы → отказ, reason=no_median')

# 3. Цена 53 ₽ при медиане 24 990 → отказ «цена подозрительно низкая»
d = run(ad(price=53, title='iPhone 13'), crit(median_price=24990))
assert (not d.ok) and d.reason == 'price_below_floor', d
assert 'ниже 15% медианы' in d.label, d.label
ok += 1
print('3) 53 ₽ при медиане 24 990 → отказ, reason=price_below_floor, подпись есть')

# 4. Реплика в описании при требовании «только оригинал»
d = run(ad(description='Продаю реплика Nike, качество отличное'),
        crit(requirements='только оригинал'))
assert (not d.ok) and d.reason in ('replica', 'requirement:реплика'), d
ok += 1
print(f'4) реплика в описании → отказ, reason={d.reason}')

# 5. Магазин, а человек просил с рук
d = run(ad(seller_type='company', seller_name='ЭплПлэйс'),
        crit(requirements='не магазин, только с рук'))
assert (not d.ok) and d.reason == 'shop', d
d2 = run(ad(seller_type='private', seller_name='Ирина'),
         crit(requirements='не магазин, только с рук'))
assert d2.ok, d2
ok += 1
print('5) магазин при «только с рук» → отказ shop; частник → проходит')

# 6. Категория не совпала
d = run(ad(category='Одежда'), crit(category='Электроника'))
assert (not d.ok) and d.reason == 'category_mismatch', d
d = run(ad(city='Москва'), crit(city='Ижевск'))
assert (not d.ok) and d.reason == 'city_mismatch', d
ok += 1
print('6) категория и город → category_mismatch / city_mismatch')

# 7. Цена, фото, состояние, аксессуар, слова заголовка
assert run(ad(price=50000), crit(max_price=30000)).reason == 'price_too_high'
assert run(ad(price=1000), crit(min_price=5000)).reason == 'price_too_low'
assert run(ad(photos='[]'), crit(with_photo=1)).reason == 'no_photo'
assert run(ad(title='iPhone 13 б/у'), crit(condition='new')).reason == 'condition_new_used'
# D2: мусор ищем по границам слов и только в начале заголовка, поэтому
# «iPhone 13, чехол в подарок» — нормальное объявление, а «Чехол для iPhone 13» — нет
assert run(ad(title='Чехол для iPhone 13'), crit()).reason == 'accessory'
assert run(ad(title='iPhone 13, чехол в подарок'), crit()).ok
assert run(ad(title='iPhone 14 128'), crit()).reason == 'title_words'
# число сверяется как отдельное слово: «43» не должно находить «143»
assert run(ad(title='Ботинки Timberland 143'), crit(query='ботинки 43')).reason == 'title_words'
assert run(ad(title='Ботинки Timberland 43'), crit(query='ботинки 43')).ok
ok += 1
print('7) цена/фото/состояние/аксессуар/слова и числа в заголовке — все причины на месте')

# 8. Скидка и режим
d = run(ad(price=8000, title='iPhone 13'), crit(median_price=10000))
assert d.ok and d.discount == 20, d
d = run(ad(price=9000, title='iPhone 13'), crit(median_price=10000, mode='deal', min_discount=15))
assert (not d.ok) and d.reason == 'discount_low', d
d = run(ad(price=10000, title='iPhone 13'), crit(median_price=10000, mode='deal'))
assert (not d.ok) and d.reason == 'not_cheaper', d
d = run(ad(price=10000, title='iPhone 13'), crit(median_price=10000, mode='any'))
assert d.ok and d.discount == 0, d
ok += 1
print('8) скидки: 20% проходит, малая скидка и «не дешевле» — отказ с причиной')

# 9. Описание: нужно, но его нет
c = crit(requirements='хорошее состояние')
d = run(ad(description=''), c, require_description=False)
assert d.ok and d.needs_description and d.reason == 'desc_needed', d
d = run(ad(description=''), c, require_description=True)
assert (not d.ok) and d.reason == 'desc_needed' and d.needs_description, d
d = run(ad(description='Состояние хорошее, без царапин'), c, require_description=True)
assert d.ok, d
ok += 1
print('9) описание требуется: без него «нужна проверка», с описанием — решение')

# 10. Скрытое и уже отправленное
assert run(ad(), crit(), hidden=True).reason == 'hidden'
assert run(ad(), crit(), already_sent=True).reason == 'already_sent'
ok += 1
print('10) hidden и already_sent → отказ с причиной')

# 11. Старое объявление
assert run(ad(published_hours_ago=500), crit()).reason == 'stale'
assert run(ad(published_hours_ago=10), crit(max_hours=24)).ok
ok += 1
print('11) свежесть: старше порога → stale, в пределах → проходит')

print(f'\nB: {ok} групп проверок, все пройдены')
