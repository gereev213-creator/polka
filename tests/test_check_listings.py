"""Тесты проверки «продано» — главной фичи, которой нет у самого Авито.

Каждый тест появился из реальной поломки:
- проверка звала fetch(), а он считает страницу валидной только по маркеру
  data-marker="item" — это маркер СТРАНИЦЫ ВЫДАЧИ, на странице объявления
  его нет ни одного. Итог: 27 запусков, ноль отметок «снято»;
- слово «продано» в описании живого лота («продано более 100 штук»)
  помечало лот исчезнувшим — а из этого считаются часы «ушло за 3 часа».

Запуск: python3 tests/test_check_listings.py
"""
import importlib.util
import os
import sys
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECT = os.path.join(HERE, '..', 'collector', 'collect.py')
FIXTURE_ITEM = os.path.join(HERE, '..', 'collector', 'fixture_item_private.html')

spec = importlib.util.spec_from_file_location('collect', COLLECT)
collect = importlib.util.module_from_spec(spec)
sys.argv = ['collect.py', '--selftest']
spec.loader.exec_module(collect)

ok = 0
fail = 0


def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'ok   {name}')
    else:
        fail += 1
        print(f'FAIL {name} {extra}')


with open(FIXTURE_ITEM, encoding='utf-8', errors='replace') as f:
    item_html = f.read()

# ── чистая функция определения судьбы лота ──────────────────────────────────
check('живой лот распознан как active',
      collect.listing_state_from_page(item_html) == 'active')
check('живой лот с «продано» в описании остаётся active',
      collect.listing_state_from_page(
          item_html + '<p>продано более 100 штук, спасибо</p>') == 'active')
check('404 — снят', collect.listing_state_from_page('', 404) == 'gone')
check('410 — снят', collect.listing_state_from_page('', 410) == 'gone')
check('страница снятия без маркеров лота — gone',
      collect.listing_state_from_page(
          '<html><body>Объявление снято с публикации</body></html>') == 'gone')
check('незнакомая страница — unknown',
      collect.listing_state_from_page('<html><body>ничего</body></html>') == 'unknown')
check('403 не считается снятием',
      collect.listing_state_from_page('', 403) == 'unknown')

# ── связка: check_listings ходит на страницу лота, а не выдачи ──────────────
sent = {}
requested = []
states = {
    'https://www.avito.ru/x_111': 'active',
    'https://www.avito.ru/x_222': 'gone',
    'https://www.avito.ru/x_333': 'unknown',
}


def fake_fetch_json(url, token, timeout=20):
    return {'source': 'avito', 'items': [
        {'external_id': '111', 'source_url': 'https://www.avito.ru/x_111'},
        {'external_id': '222', 'source_url': 'https://www.avito.ru/x_222'},
        {'external_id': '333', 'source_url': 'https://www.avito.ru/x_333'},
    ]}


def fake_state(url, timeout=20):
    requested.append(url)
    return states[url]


def fake_post_json(url, token, payload, timeout=60):
    sent['payload'] = payload
    return {'ok': True, 'gone': 1}


def forbidden_fetch(*args, **kwargs):
    raise AssertionError('check_listings не должен звать fetch(): он для выдачи')


with mock.patch.object(collect, 'fetch_json', fake_fetch_json), \
        mock.patch.object(collect, 'fetch_item_state', fake_state), \
        mock.patch.object(collect, 'post_json', fake_post_json), \
        mock.patch.object(collect, 'fetch', forbidden_fetch), \
        mock.patch.object(collect.time, 'sleep'):
    gone = collect.check_listings('https://server', 'token', limit=3)

check('check_listings открыл все 3 лота', len(requested) == 3, requested)
check('в отчёт попали active и gone, unknown пропущен',
      [i['state'] for i in sent.get('payload', {}).get('items', [])]
      == ['active', 'gone'], sent.get('payload'))
check('снятых один', gone == 1)
check('лот с нераспознанной страницей не отправлен',
      all(i['external_id'] != '333'
          for i in sent.get('payload', {}).get('items', [])))

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
