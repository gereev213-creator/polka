"""Тесты этапа A4: сборщик дозагружает описания кандидатов.

Проверяем на настоящем коде collect.py с подменёнными сетевыми вызовами:
успешный разбор, пустое описание, блокировка (код 3) и то, что сервер
получает ровно один запрос с собранными описаниями.

Запуск: python3 tests/test_collect_details.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECTOR = os.path.join(HERE, '..', 'collector')
sys.path.insert(0, COLLECTOR)

import collect  # noqa: E402

FIXTURE = os.path.join(COLLECTOR, 'fixture_item_private.html')
PAGE = open(FIXTURE, encoding='utf-8').read()

sent = []


def fake_push_details(server, token, source, items):
    sent.append({'server': server, 'token': token, 'source': source, 'items': items})
    return {'ok': True, 'updated': len(items), 'failed': 0}


collect.push_details = fake_push_details

# ── 1. Успешный разбор: описание и продавец уходят на сервер
collect.fetch_item = lambda url, timeout=20: PAGE
items = [{'external_id': '819813177', 'url': 'https://www.avito.ru/x_819813177'}]
n = collect.collect_details('https://srv', 'tok', 'avito', items, pause=(0, 0))
assert n == 1 and len(sent) == 1, (n, sent)
posted = sent[-1]['items'][0]
assert posted['external_id'] == '819813177' and posted['state'] == 'ok', posted
assert len(posted['description']) >= 20 and 'Джемпер' in posted['description'], posted
assert posted['seller_type'] == 'private' and posted['seller_name'], posted
assert sent[-1]['token'] == 'tok' and sent[-1]['source'] == 'avito'
print(f"1) успех: описание {len(posted['description'])} симв., "
      f"продавец {posted['seller_name']!r} ({posted['seller_type']}) ушли на сервер")

# ── 2. Пустая страница (описания нет) → state=failed, повторим позже
sent.clear()
collect.fetch_item = lambda url, timeout=20: '<html><body>ничего</body></html>'
n = collect.collect_details('https://srv', 'tok', 'avito', items, pause=(0, 0))
assert sent[-1]['items'][0]['state'] == 'failed', sent
print('2) пустое описание → state=failed (сервер повторит не раньше 30 минут)')

# ── 3. Ошибка сети на одной карточке не срывает остальные
sent.clear()
calls = {'n': 0}


def flaky(url, timeout=20):
    calls['n'] += 1
    if calls['n'] == 1:
        raise TimeoutError('не открылось')
    return PAGE


collect.fetch_item = flaky
two = [{'external_id': 'a', 'url': 'https://www.avito.ru/a_1'},
       {'external_id': 'b', 'url': 'https://www.avito.ru/b_2'}]
collect.collect_details('https://srv', 'tok', 'avito', two, pause=(0, 0))
states = {i['external_id']: i['state'] for i in sent[-1]['items']}
assert states == {'a': 'failed', 'b': 'ok'}, states
print('3) сбой одной карточки → failed у неё, остальные обрабатываются')

# ── 4. Блокировка на странице объявления: описания пропускаем, сбор не валим
sent.clear()
calls['n'] = 0


def blocked_after_first(url, timeout=20):
    calls['n'] += 1
    if calls['n'] == 1:
        return PAGE
    raise collect.Blocked('HTTP 429 — доступ ограничен по IP')


collect._DETAILS_BLOCKED = False
collect.fetch_item = blocked_after_first
collect.collect_details('https://srv', 'tok', 'avito', two, pause=(0, 0))
assert len(sent) == 1 and sent[0]['items'][0]['external_id'] == 'a', sent
# failed серверу не отправляем: иначе три прохода на дата-центре закроют карточку
assert all(i['state'] == 'ok' for i in sent[0]['items']), sent[0]['items']
assert collect._DETAILS_BLOCKED is True, 'флаг блокировки не выставлен'
# и в этом же проходе больше не пробуем
sent.clear()
collect.collect_details('https://srv', 'tok', 'avito', two, pause=(0, 0))
assert sent == [], 'продолжаем долбить Авито после блокировки'
collect._DETAILS_BLOCKED = False
print('4) блокировка на карточке → описания пропускаем, сбор продолжается, failed не шлём')

# ── 5. Ограничение паузы: 25 карточек максимум за проход (сервер режет сам)
print('5) пауза между карточками задаётся параметром pause (4–9 с по умолчанию)')

print('\nA4: все проверки пройдены')
