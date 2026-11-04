"""Парсер ссылки — просто: открыть, сравнить, отправить новое.

Проверяем сквозной проход сборщика по ссылке клиента без сети:
  1) первый проход — снимок выдачи: ничего не отправляем;
  2) второй проход с той же выдачей — новостей нет, тишина;
  3) третий проход с новым лотом — уходит ТОЛЬКО новый, вместе с crit_ids,
     чтобы сервер примерял его лишь к этому поиску;
  4) блокировка Авито не превращает ссылку в «весь раздел»: повторного
     запроса без q= нет.

Запуск: python3 tests/test_link_parser_simple.py
"""
import importlib.util
import os
import sys
import time as _real_time
import types

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECT = os.path.join(HERE, '..', 'collector', 'collect.py')

spec = importlib.util.spec_from_file_location('collect', COLLECT)
collect = importlib.util.module_from_spec(spec)
sys.argv = ['collect.py', '--selftest']
os.environ['POLKA_USE_STATIC_TARGETS'] = '1'
spec.loader.exec_module(collect)

STATE = {}
PUSHED = []
PUSHED_CRITS = []
FETCHED = []


class _Time:
    def sleep(self, *_a):
        return None

    def __getattr__(self, name):
        return getattr(_real_time, name)


collect.time = _Time()
collect.random = types.SimpleNamespace(uniform=lambda *a: 0)
collect.collect_details = lambda *a, **k: 0
collect.fetch_need_details = lambda *a, **k: []
collect.load_targets_state = lambda: dict(STATE)
collect.save_targets_state = lambda st: STATE.update(st)
collect.block_cool_down = lambda *a, **k: (_ for _ in ()).throw(
    AssertionError('ссылка не должна уходить в отдых по разделу'))


def fake_push(server, token, source, items, crit_ids=None):
    PUSHED.append([i.get('external_id') for i in items])
    PUSHED_CRITS.append(list(crit_ids or []))
    return {'accepted': len(items), 'duplicate': 0, 'skipped': 0,
            'ids': [], 'need_details': []}


collect.push = fake_push
# Цели строим сами: в этом тесте проверяется проход, а не сеть.
collect.targets_from_criteria = lambda *a, **k: [dict(TARGET)]

LINK = ('https://www.avito.ru/all/telefony/mobilnye_telefony/apple/iphone_17_pro/'
        'oranzhevyy-ASgBAgICBESwwA3e_zeywA22hrQVtMANzqs5sMENiPw3'
        '?f=ASgBAQECBESwwA3e~&radius=0&s=104&user=1')

TARGET = {'url': LINK, 'link': True, 'crit_id': 152, 'crit_ids': [152],
          'city': '', 'category': ''}


def cfg():
    return {'server': 'http://server', 'token': 'ingest', 'targets': [TARGET]}


def items(*ids):
    return [{'external_id': str(i), 'title': f'iPhone 17 Pro {i}', 'price': 100000,
             'url': f'https://www.avito.ru/all/telefony/{i}', 'city': '',
             'category': 'telefony'} for i in ids]


def reset(pages):
    PUSHED.clear()
    PUSHED_CRITS.clear()
    FETCHED.clear()
    STATE.clear()

    def fetch(url, **kw):
        FETCHED.append(url)
        page = pages[len(FETCHED) - 1]
        if isinstance(page, Exception):
            raise page
        return page

    collect.fetch = fetch
    collect.parse_page = lambda html: list(html)


# ── 1) первый проход: снимок выдачи, отправок нет ──────────────────────────
reset([items(1, 2, 3)])
sent = collect.run_once(cfg())
assert sent == 0, sent
assert PUSHED == [], PUSHED
assert STATE[LINK].get('baseline') == 1, STATE
assert STATE[LINK].get('seen_ids') == ['1', '2', '3'], STATE
print('1) первый проход — снимок выдачи, без отправки')

# ── 2) та же выдача — тишина ───────────────────────────────────────────────
PUSHED.clear()
PUSHED_CRITS.clear()
FETCHED.clear()
reset([items(1, 2, 3)])
STATE[LINK] = {'baseline': 1, 'seen_ids': ['1', '2', '3']}
sent = collect.run_once(cfg())
assert sent == 0 and PUSHED == [], (sent, PUSHED)
print('2) новых лотов нет — ничего не отправлено')

# ── 3) появился новый лот — уходит только он и со своим crit_ids ───────────
reset([items(1, 2, 3, 4)])
STATE[LINK] = {'baseline': 1, 'seen_ids': ['1', '2', '3']}
sent = collect.run_once(cfg())
assert PUSHED == [['4']], PUSHED
assert PUSHED_CRITS == [[152]], PUSHED_CRITS
assert '4' in STATE[LINK]['seen_ids'], STATE
print('3) новый лот отправлен один, с crit_ids=[152]')

# ── 4) блокировка: без подмены ссылки на раздел и без второго запроса ────
reset([collect.Blocked('HTTP 439 — доступ ограничен по IP')])
STATE[LINK] = {'baseline': 1, 'seen_ids': ['1', '2', '3']}
try:
    collect.run_once(cfg())
except SystemExit as exc:
    raise AssertionError(f'проход не должен падать из-за блока: {exc.code}')
assert len(FETCHED) == 1, FETCHED
assert FETCHED[0] == LINK, FETCHED
assert PUSHED == [], PUSHED
print('4) блок ссылки — ни подмены на раздел, ни лишнего запроса')

print('\nпарсер ссылки: простое «открыть → сравнить → отправить новое» работает')
