"""Тесты этапа A: разбор страницы объявления и одиночный запрос.

Работают на НАСТОЯЩИХ сохранённых страницах Авито (collector/fixture_item_*.html)
и на синтетических образцах для запасных путей.

Запуск: python3 tests/test_parse_item.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECTOR = os.path.join(HERE, '..', 'collector')
sys.path.insert(0, COLLECTOR)

import collect  # noqa: E402

FIXTURES = os.path.join(COLLECTOR)


def read(name):
    with open(os.path.join(FIXTURES, name), encoding='utf-8') as fh:
        return fh.read()


# ── 1. Частник: джемпер
jumper = collect.parse_item_page(read('fixture_item_private.html'))
assert len(jumper['description']) >= 20, jumper
assert 'Джемпер' in jumper['description'], jumper['description'][:80]
assert jumper['seller_type'] == 'private', jumper
assert jumper['seller_name'], 'имя продавца не разобралось'
print(f"1) частник: описание {len(jumper['description'])} симв., "
      f"продавец {jumper['seller_name']!r} ({jumper['seller_type']}), "
      f"объявлений {jumper['seller_ads']}")

# ── 2. Магазин: iPhone
phone = collect.parse_item_page(read('fixture_item_shop.html'))
assert len(phone['description']) >= 100, len(phone['description'])
assert phone['seller_type'] == 'company', phone
assert phone['seller_name'], 'имя продавца не разобралось'
# Описание магазина содержит вложенные теги и <br> — раньше разбор обрывался
# на первой вложенной закрывашке и возвращал кусок первой строки.
assert phone['description'].count('\n') >= 0 and 'гарантии' in phone['description'].lower(), phone['description'][:200]
print(f"2) магазин: описание {len(phone['description'])} симв., "
      f"продавец {phone['seller_name']!r} ({phone['seller_type']})")

# ── 3. Вложенная разметка: описание целиком, а не до первого </div>
nested = ('<div data-marker="item-view/item-description" class="x">'
          '<p>Первая строка</p><div>Вторая <b>строка</b></div>'
          '<p>Третья<br>четвёртая</p></div>')
got = collect.parse_item_page(nested)['description']
assert 'Первая строка' in got and 'Вторая строка' in got and 'Третья' in got and 'четвёртая' in got, got
print(f'3) вложенная разметка: {got!r}')

# ── 4. Запасные пути: og:description, meta, JSON-LD
og = '<html><head><meta property="og:description" content="Описание из og-тега &amp; с сущностями"></head></html>'
assert 'из og-тега & с сущностями' in collect.parse_item_page(og)['description'], collect.parse_item_page(og)
meta = '<html><head><meta name="description" content="Описание из meta-тега, достаточно длинное"></head></html>'
assert 'из meta-тега' in collect.parse_item_page(meta)['description']
ld = ('<html><head><script type="application/ld+json">'
      '{"@type":"Product","description":"Описание из JSON-LD, тоже длинное"}</script></head></html>')
assert 'из JSON-LD' in collect.parse_item_page(ld)['description']
print('4) запасные пути: og:description, meta, JSON-LD работают')

# ── 5. Обрезка до 2000 символов
long_html = ('<div data-marker="item-view/item-description">' + 'я' * 5000 + '</div>')
assert len(collect.parse_item_page(long_html)['description']) == 2000
print('5) описание обрезается до 2000 символов')

# ── 6. fetch_item: ОДИН запрос и определение блокировки
class Resp:
    def __init__(self, code, text):
        self.status_code = code
        self.text = text


class FakeCffi:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, impersonate=None, timeout=None, proxies=None):
        self.calls.append({'url': url, 'impersonate': impersonate})
        return self.responses.pop(0)


page = ('<html><div data-marker="item-view/title-info">Телефон</div>' + 'x' * 25000 + '</html>')

for code in (403, 429, 439):
    fake = FakeCffi([Resp(code, page)])
    collect._cffi, collect._WORKING_PROFILE = fake, 'safari17_0'
    try:
        collect.fetch_item('https://www.avito.ru/x_1')
        raise AssertionError(f'HTTP {code} не распознан как блокировка')
    except collect.Blocked:
        pass
    assert len(fake.calls) == 1, f'должен быть ровно один запрос, а их {len(fake.calls)}'
    assert fake.calls[0]['impersonate'] == 'safari17_0', 'не использован рабочий отпечаток'

captcha = Resp(200, '<html>' + 'Доступ ограничен: проблема с IP' + 'x' * 100 + '</html>')
fake = FakeCffi([captcha])
collect._cffi = fake
try:
    collect.fetch_item('https://www.avito.ru/x_1')
    raise AssertionError('короткая страница с капчей не распознана')
except collect.Blocked:
    pass

ok_resp = Resp(200, page)
fake = FakeCffi([ok_resp])
collect._cffi = fake
got = collect.fetch_item('https://www.avito.ru/x_1', timeout=20)
assert got == page and len(fake.calls) == 1, (len(fake.calls), got[:40])
assert 'data-marker="item"' not in page, 'страница объявления не содержит маркера выдачи — как на живом сайте'
print('6) fetch_item: 403/429/439 и капча → Blocked, обычная страница → текст, запрос ровно один')

collect._cffi = None
print('\nA: все проверки пройдены')
