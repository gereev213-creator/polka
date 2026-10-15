"""Тесты универсальных шаблонов критериев.

Проверяем:
 1. Наполнение идемпотентно, шаблоны видны приложению.
 2. У каждого шаблона есть категория объявления (по ней идёт отбор).
 3. Слова каждого шаблона узнаются сборщиком — иначе критерий не искался бы
    вовсе (для этого и держим словарь CATEGORY_BY_WORD в collect.py).

Запуск: python3 tests/test_templates.py
"""
import importlib.util
import json
import os
import re
import sqlite3
import sys
from typing import Any, Dict, List, Optional

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
COLLECT = os.path.join(HERE, '..', 'collector', 'collect.py')
SRC = open(BOT, encoding='utf-8').read()

TOKENS = ('_TRANSLIT_RU_EN', 'HUNT_TEMPLATES', 'HUNT_TEMPLATE_GROUPS',
          '_template_slug', 'ensure_templates',
          'templates_public', '_crit_category_for_template')


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


conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
ns = {'os': os, 'json': json, 're': re, 'Any': Any, 'Dict': Dict, 'List': List,
      'Optional': Optional, 'db': type('D', (), {'conn': conn})(),
      'logger': type('L', (), {'warning': staticmethod(lambda *a, **k: None),
                               'info': staticmethod(lambda *a, **k: None)})(),
      'get_moscow_time': lambda: __import__('datetime').datetime(2026, 10, 15, 12, 0)}

picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS and n not in [p[0] for p in picked]:
        picked.append((n, '\n'.join(chunk)))
missing = [n for n in TOKENS if n not in [p[0] for p in picked]]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

ns['ensure_templates']()
ns['ensure_templates']()          # повтор — не должен плодить дубли
templates = ns['templates_public']()
expect = len(ns['HUNT_TEMPLATES'])
assert len(templates) == expect, f'шаблонов {len(templates)}, ожидали {expect}'
print(f'1) наполнение идемпотентно: {len(templates)} шаблонов')

groups = ns['HUNT_TEMPLATE_GROUPS']
seen = {t['group'] for t in templates}
assert seen <= set(groups), seen - set(groups)
for t in templates:
    assert t['group_title'] and t['query'] and t['title'], t
print(f'2) групп: {len(seen)}, у каждого шаблона есть название, запрос и группа')

no_cat = [t['title'] for t in templates
          if not ns['_crit_category_for_template'](t['group'])]
assert not no_cat, f'без категории объявления: {no_cat}'
print('3) у каждого шаблона есть категория объявления (по ней идёт отбор)')

spec = importlib.util.spec_from_file_location('collect', COLLECT)
collector = importlib.util.module_from_spec(spec)
sys.argv = ['collect.py', '--selftest']
spec.loader.exec_module(collector)

bad = []
for t in templates:
    words = [w for w in re.split(r'[^\w]+', t['query'].lower()) if w]
    if not any(w in collector.CATEGORY_BY_WORD for w in words):
        bad.append(t['title'])
assert not bad, f'сборщик не определит раздел: {bad}'
print(f'4) все шаблоны попадают в раздел Авито (словарь сборщика: '
      f'{len(collector.CATEGORY_BY_WORD)} слов)')

with_req = [t for t in templates if t['requirements_json']]
phones = [t for t in templates if t['group'] == 'telefony']
assert phones and all(t['requirements_json'].get('battery_min') for t in phones), phones
print(f'5) требований в шаблонах: {len(with_req)}; у всех телефонов — проверка АКБ')

print('\nшаблоны: все проверки пройдены')
