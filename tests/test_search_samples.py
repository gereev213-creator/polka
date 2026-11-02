"""Примеры находок до создания поиска: API + клиент.

Зачем: 23 из 30 поисков не дали ни одной находки. Человек создаёт поиск,
сутки ждёт тишины и уходит. Теперь по мере ввода запроса он сразу видит,
что уже есть на Авито — ценность до регистрации поиска.

Запуск: python3 tests/test_search_samples.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
TPL = open(os.path.join(ROOT, 'polka-final/frontend/proto/template.html'), encoding='utf-8').read()
ADP = open(os.path.join(ROOT, 'polka-final/frontend/proto/adapter.js'), encoding='utf-8').read()
IDX = open(os.path.join(ROOT, 'polka-final/frontend/proto/index.html'), encoding='utf-8').read()

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


# 1) сервер
check('эндпоинт объявлен', 'async def api_hunt_sample(' in SRC)
check('маршрут зарегистрирован', "'/api/hunt/sample', api_hunt_sample" in SRC)
check('требует авторизации', "return _miniapp_err('unauthorized', 401)" in SRC)
check('ограничивает выдачу', 'limit = max(1, min(6, limit))' in SRC)
check('только активные', "if str(ad.get('status') or '') != 'active':" in SRC)
check('только с ценой', 'if price <= 0:' in SRC)
check('убирает дубли', 'if key in seen_keys:' in SRC)
check('событие sample_shown пишется', "'sample_shown'" in SRC)

# 2) клиент: разметка и стили
check('блок примеров в шаблоне', 'id="sampleBox"' in TPL)
check('стили примеров', '.sampleRow' in TPL and '.sampleTitle' in TPL)
check('блок есть в собранной странице', 'id="sampleBox"' in IDX)
check('подпись «уже есть на Авито»', 'Уже есть на Авито по этому запросу' in ADP)
check('пустое состояние объясняет поиск', 'создайте поиск' in ADP.lower() or 'создайте поиск' in ADP)

# 3) клиент: логика
check('запрос с дебаунсом 500 мс', 'setTimeout(fetchSamples, 500)' in ADP)
check('минимум 3 символа', "if (q.length < 3)" in ADP)
check('запрос к API примеров', "'/api/hunt/sample?q='" in ADP)
check('клик открывает объявление', 'data-sample-url' in ADP and 'TG.openLink' in ADP)
check('примеры скрываются после создания', 'sampleBox.innerHTML = \'\'' in ADP)
check('ошибка примеров не ломает форму', 'примеры — не критично' in ADP)

# 4) мусор не попадает в примеры (чехлы, плёнки, коробки)
check('есть фильтр мусора', 'def _sample_is_junk(' in SRC)
check('использует общие списки находок', 'HUNT_RE_JUNK_START' in SRC and 'HUNT_RE_JUNK_ANYWHERE' in SRC)
check('фильтр применяется в выдаче', 'if _sample_is_junk(title, q,' in SRC)
check('не фильтрует слово из запроса', 'not in low_q' in SRC)

# 5) живая проверка фильтра мусора (функции достаём из исходника)
import ast
import re

tree = ast.parse(SRC)
_fns = {}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and getattr(node, 'name', None) in (
            '_hunt_word_pattern', '_sample_is_junk'):
        exec(ast.get_source_segment(SRC, node), _fns)
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id in ('HUNT_JUNK_ANYWHERE', 'HUNT_JUNK_START'):
                exec(ast.get_source_segment(SRC, node), _fns)
_fns['re'] = re
_fns['HUNT_RE_JUNK_ANYWHERE'] = _fns['_hunt_word_pattern'](_fns['HUNT_JUNK_ANYWHERE'])
_fns['HUNT_RE_JUNK_START'] = _fns['_hunt_word_pattern'](_fns['HUNT_JUNK_START'])
is_junk = _fns['_sample_is_junk']

check('чехлы отсекаются (множественное число)', is_junk('Чехлы на айфоны', 'айфон'))
check('чехол отсекается', is_junk('Чехол на iPhone 13', 'айфон'))
check('повербанк отсекается', is_junk('Повербанк для айфона', 'айфон'))
check('телефон не отсекается', not is_junk('iPhone 15 Pro 128 ГБ', 'айфон'))
check('куртка не отсекается', not is_junk('Куртка зимняя мужская', 'куртка'))
check('если ищут чехол — не фильтруем', not is_junk('Чехлы на айфон', 'чехлы'))
check('аксессуар «для запроса» отсекается',
      is_junk('Apple USB-C 20W для iPhone 11-17 Pro Max', 'iphone'))
check('товар с «для» в подарок не отсекается',
      not is_junk('Куртка зимняя для мальчика', 'куртка'))
check('аксессуар «для» отсекается и по латинскому варианту',
      is_junk('Apple USB-C 20W для iPhone 11-17 Pro Max', 'айфон', 'iphone'))
check('телефон с «для» в подарок не отсекается',
      not is_junk('iPhone 15 Pro 128 ГБ', 'айфон', 'iphone'))

# 6) регресс: дедуп не должен ронять выдачу (NameError в _collect)
_start = SRC.index('async def api_hunt_sample(')
_end = SRC.index('async def api_client_event(', _start)
_body = SRC[_start:_end]
check('нет обращения к несуществующей seen', 'in seen:' not in _body and 'seen.add(' not in _body)
check('дедуп по id', 'seen_ads = set()' in _body)
check('дедуп по заголовку+цене', 'seen_keys = set()' in _body)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
