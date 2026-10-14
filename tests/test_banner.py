"""Тесты баннеров: работа без внешнего хостинга картинок.

Повод: на Амвере нет доступа к i.ibb.co, и прогрев писал по строке на каждую
ссылку с 15-секундным ожиданием. Баннеры при этом должны продолжать работать:
ссылка (её скачает Telegram) → кеш байтов → картинка, нарисованная кодом.

Запуск: python3 tests/test_banner.py
"""
import json
import os
import re
from typing import Any, Dict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

TOKENS = ('BANNERS', 'BANNER_CACHE', 'BANNER_PRECACHE_ENABLED', 'BANNER_PRECACHE_RETRY_SEC',
          '_BANNER_PRECACHE', '_BANNER_LOCAL_CACHE', '_banner_url', '_banner_local_png',
          'banner_photo_src')


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


settings = {}
ns = {'os': os, 'json': json, 'Any': Any, 'Dict': Dict, '_time': __import__('time'),
      'logger': type('L', (), {'warning': staticmethod(lambda *a, **k: None),
                               'info': staticmethod(lambda *a, **k: None),
                               'error': staticmethod(lambda *a, **k: None)})(),
      'cfg_get': lambda key, default=None: settings.get(key, default)}

picked = []
for chunk in chunks(SRC):
    n = name_of(chunk)
    if n in TOKENS and n not in [p[0] for p in picked]:
        picked.append((n, '\n'.join(chunk)))
missing = [n for n in TOKENS if n not in [p[0] for p in picked]]
assert not missing, f'не нашлись куски: {missing}'
for _n, text in picked:
    exec(text, ns)

banner_url = ns['_banner_url']
local_png = ns['_banner_local_png']
photo_src = ns['banner_photo_src']
cache = ns['BANNER_CACHE']
BANNERS = ns['BANNERS']
ok = 0

# ── 1. Все баннеры описаны и имеют адрес по умолчанию
assert len(BANNERS) >= 5, BANNERS
for key in ('welcome', 'favorites', 'profile', 'create_ad', 'admin'):
    assert key in BANNERS, key
    assert banner_url(key).startswith('http'), key
ok += 1
print(f'1) баннеров в конфиге: {len(BANNERS)}, у каждого есть адрес по умолчанию')

# ── 2. Ссылку можно заменить настройкой (без релиза)
settings['banner.urls'] = json.dumps({'welcome': 'https://polka.example/banner/welcome.png'})
assert banner_url('welcome') == 'https://polka.example/banner/welcome.png', banner_url('welcome')
assert banner_url('favorites').startswith('http'), banner_url('favorites')   # остальные не тронуты
settings['banner.urls'] = 'не json'      # мусор в настройке не должен ломать
assert banner_url('welcome') in BANNERS.values() or banner_url('welcome').startswith('http')
settings.pop('banner.urls', None)
ok += 1
print('2) ссылку на баннер можно заменить настройкой banner.urls, мусор не ломает')

# ── 3. Картинка рисуется кодом: PNG даже без интернета
data = local_png('welcome')
assert isinstance(data, bytes) and len(data) > 500, len(data)
assert data[:8] == b"\x89PNG\r\n\x1a\n", data[:8]
assert local_png('welcome') is data or local_png('welcome') == data, 'кеш не работает'
ok += 1
print(f'3) локальный баннер рисуется кодом: PNG {len(data)} байт (без сети)')

# ── 4. Что отдаём в reply_photo: кеш байтов важнее ссылки
cache['welcome'] = data
assert photo_src('welcome') == data, 'кеш не приоритетнее ссылки'
cache.pop('welcome', None)
assert photo_src('welcome').startswith('http'), photo_src('welcome')
ok += 1
print('4) приоритет картинки: байты из кеша → ссылка (её скачает Telegram)')

# ── 5. В коде не осталось прямых обращений к внешнему хостингу
direct = re.findall(r"""BANNERS\[["'][a-z_]+["']\]""", SRC)
assert not direct, f'прямые BANNERS[...] остались: {direct[:3]}'
assert 'banner_photo_src(' in SRC, 'нет вызовов banner_photo_src'
ok += 1
print('5) прямых BANNERS[...] в коде нет — все через banner_photo_src/настройку')

print('\nбаннеры: все проверки пройдены')
