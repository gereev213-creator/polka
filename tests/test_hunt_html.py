"""Тесты этапа D1: экранирование HTML в сообщениях о находках.

Проверяем НАСТОЯЩИЙ код из polka_bot-9-3.py: функции вырезаются из файла и
исполняются в тестовом окружении (бот целиком не импортируется — ему нужны
токен, база и python-telegram-bot).

Запуск: python3 tests/test_hunt_html.py
"""
import html
import re
import sys
from html.parser import HTMLParser

import os
BOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py')

SRC = open(BOT, encoding='utf-8').read()


def cut(start_marker, stop_regex, what):
    """Вырезает текст от start_marker до первого совпадения stop_regex."""
    i = SRC.index(start_marker)
    m = re.compile(stop_regex, re.M).search(SRC, i + len(start_marker))
    assert m, f'не найден конец блока: {what}'
    return SRC[i:m.start()]


ns = {'_html': html, 'Dict': dict, 'logger': type('L', (), {
    'warning': staticmethod(lambda *a, **k: None)})(), 'ParseMode': type('P', (), {'HTML': 'HTML'})}
for name, stop in [
    ('_hunt_escape', r'^(async )?def '),
    ('_hunt_match_text', r'^(async )?def '),
    ('_hunt_digest_text', r'^(async )?def '),
    ('_send_html_safe', r'^(async )?def '),
    ('_money', r'^(async )?def '),
]:
    start = f'async def {name}(' if f'async def {name}(' in SRC else f'def {name}('
    src = cut(start, stop, name)
    exec(src, ns)

esc, match_text, digest_text = ns['_hunt_escape'], ns['_hunt_match_text'], ns['_hunt_digest_text']

# ── 1. Экранирование
cases = [
    ('Кроссовки H&M', 'Кроссовки H&amp;M'),
    ('<новая> куртка', '&lt;новая&gt; куртка'),
    ('A < B', 'A &lt; B'),
    ('iPhone 13 «256» & чехол', 'iPhone 13 «256» &amp; чехол'),
    (None, ''),
]
for raw, want in cases:
    got = esc(raw)
    assert got == want, f'esc({raw!r}) = {got!r}, ждали {want!r}'
print(f'1) экранирование: {len(cases)} кейсов ок')


class Strip(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, d):
        self.parts.append(d)

    def text(self):
        return ''.join(self.parts)


def plain(html_text):
    p = Strip()
    p.feed(html_text)
    return p.text()


ALLOWED_TAGS = {'b', 'i', 'code', 'a', 's', 'u'}

# ── 2. Текст сообщения о находке
tests = [
    ('Кроссовки H&M', 'Москва', 'Кроссовки H&M'),
    ('<новая> куртка', 'Санкт-Петербург & ЛО', '<новая> куртка'),
    ('A < B', '', 'A < B'),
]
for title, city, want_plain in tests:
    ad = {'id': 1, 'title': title, 'price': 1500, 'city': city}
    text = match_text(ad, 'только что', median=3000, diff=1500)
    tags = set(re.findall(r'</?([a-zA-Z0-9]+)', text))
    assert tags <= ALLOWED_TAGS, f'посторонние теги в сообщении: {tags - ALLOWED_TAGS}'
    got = plain(text)
    assert want_plain in got, f'в тексте нет {want_plain!r}: {got!r}'
    assert title not in text or '<' not in title, f'сырой HTML в сообщении: {text!r}'
    print(f'   · {title!r} → {text.splitlines()[2]!r}')

# вердикт ИИ тоже экранируется
text = match_text({'id': 1, 'title': 'Куртка', 'price': 1000, 'city': 'Ижевск'},
                  '2 ч назад', verdict='Мимо: <b>реплика</b> & копия')
assert '<b>реплика</b>' not in text, 'вердикт не экранирован'
assert plain(text).count('Мимо: <b>реплика</b> & копия') == 1, plain(text)
print('2) сообщение о находке: теги только разрешённые, «&»/«<»/«>» доходят как текст')

# ── 3. Сводка
query = 'iPhone 15 <256> & Pro'
fresh = [({'id': 2, 'title': 'iPhone 15 & Pro <256>', 'price': 55000}, 20),
         ({'id': 3, 'title': 'Смартфон', 'price': 30000}, 5)]
dt = digest_text(query, 12, fresh)
tags = set(re.findall(r'</?([a-zA-Z0-9]+)', dt))
assert tags <= ALLOWED_TAGS, f'посторонние теги в сводке: {tags - ALLOWED_TAGS}'
p = plain(dt)
assert f'«{query}»' in p, p
assert 'iPhone 15 & Pro <256>' in p, p
assert '…и ещё 10' in p, p
print('3) сводка: запрос и заголовки экранированы, текст на месте')


# ── 4. Запасной путь без parse_mode
class FakeBot:
    def __init__(self, fail_html=False, fail_always=False):
        self.calls = []
        self.fail_html = fail_html
        self.fail_always = fail_always

    async def send(self, **kw):
        self.calls.append(kw)
        if self.fail_always:
            raise RuntimeError("Bad Request: can't parse entities: Unexpected end tag")
        if self.fail_html and 'parse_mode' in kw:
            raise RuntimeError("Bad Request: can't parse entities: Unexpected end tag")


async def check_send():
    ok = await ns['_send_html_safe'](FakeBot().send, chat_id=1, text='<b>ок</b>')
    assert ok, 'обычная отправка не прошла'

    bot = FakeBot(fail_html=True)
    ok = await ns['_send_html_safe'](bot.send, chat_id=1, text='<b>ок</b>')
    assert ok, 'не сработал повтор без разметки'
    assert len(bot.calls) == 2 and 'parse_mode' not in bot.calls[1], bot.calls
    assert bot.calls[0].get('parse_mode') == 'HTML'

    bot2 = FakeBot(fail_always=True)
    ok = await ns['_send_html_safe'](bot2.send, chat_id=1, text='x')
    assert ok is False, 'при постоянной ошибке должно вернуться False'


import asyncio
asyncio.run(check_send())
print('4) запасной путь: при «can\'t parse entities» повтор без разметки, иначе False')
print('\nD1: все проверки пройдены')
