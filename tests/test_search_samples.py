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
check('убирает дубли', 'if key in seen:' in SRC)
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

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
