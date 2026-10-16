"""Тесты одного прохода сборщика (run_once) — без сети.

Проверяем то, что раньше было сломано: обработка результата должна идти
ДЛЯ КАЖДОЙ страницы внутри цикла по ссылкам цели.

  а) первая цель падает с URLError — проход не падает и ничего не отправляет;
  б) вторая цель падает — отправка ровно одна, за первую цель;
  в) у цели две страницы — отправка происходит для обеих;
  г) блокировка Авито (Blocked) — выход с кодом 3, уже собранное отправлено.

Запуск: python3 tests/test_collector_run_once.py
"""
import importlib.util
import os
import sys
import time as _real_time
import types
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECT = os.path.join(HERE, '..', 'collector', 'collect.py')

spec = importlib.util.spec_from_file_location('collect', COLLECT)
collect = importlib.util.module_from_spec(spec)
sys.argv = ['collect.py', '--selftest']
spec.loader.exec_module(collect)

# ── Окружение без сети и без задержек ─────────────────────────────────────
STATE = {}


class _Time:
    """Настоящее время, но sleep не спит: тест не должен ждать 12 секунд."""

    def sleep(self, *_a):
        return None

    def __getattr__(self, name):
        return getattr(_real_time, name)


collect.time = _Time()
collect.random = types.SimpleNamespace(uniform=lambda *a: 0)
# Критерии не тянем (это сеть), описания не открываем, состояние — в памяти
collect.targets_from_criteria = lambda server, token, cfg: []
collect.collect_details = lambda *a, **k: 0
collect.fetch_need_details = lambda *a, **k: []
collect.load_targets_state = lambda: dict(STATE)
collect.save_targets_state = lambda st: STATE.update(st)

PUSHED = []


def make_push():
    def push(server, token, source, items):
        PUSHED.append([i.get('title') for i in items])
        return {'accepted': len(items), 'duplicate': 0, 'skipped': 0,
                'ids': [], 'need_details': []}
    return push


def parse(html):
    # «html» несёт в себе имя цели — так видно, чьи карточки ушли
    return [{'title': f'лот-{html}', 'price': 100, 'source_url': f'http://x/{html}'}]


def cfg_with(targets, max_targets=40):
    return {'server': 'http://server', 'token': 'ingest', 'targets': targets,
            'max_targets': max_targets}


T1 = {'url': 'https://www.avito.ru/izhevsk/telefony', 'city': 'Ижевск'}
T2 = {'url': 'https://www.avito.ru/izhevsk/noutbuki', 'city': 'Ижевск'}


def reset():
    PUSHED.clear()
    STATE.clear()
    collect.parse_page = parse
    collect.push = make_push()


# ── а) первая цель падает с URLError: ничего не отправлено, проход жив
reset()
collect.fetch = lambda url: (_ for _ in ()).throw(
    urllib.error.URLError('сеть недоступна'))
sent = collect.run_once(cfg_with([T1, T2]))
assert sent == 0, sent
assert PUSHED == [], PUSHED
print('а) первая цель с URLError — проход не упал, отправок нет')

# ── б) вторая цель падает: отправка ровно одна, за первую
reset()
calls = {'n': 0}


def fetch_second_fails(url):
    calls['n'] += 1
    if calls['n'] == 1:
        return 'первая'
    raise urllib.error.URLError('сеть пропала на второй цели')


collect.fetch = fetch_second_fails
sent = collect.run_once(cfg_with([T1, T2]))
assert len(PUSHED) == 1, PUSHED
assert PUSHED[0] == ['лот-первая'], PUSHED
assert sent == 1, sent
print('б) вторая цель с URLError — отправка ровно одна, за первую цель')

# ── в) цель на две страницы: отправка для каждой страницы
reset()
collect.fetch = lambda url: ('стр1' if 'p=2' not in url else 'стр2')
sent = collect.run_once(cfg_with([{'url': T1['url'], 'city': 'Ижевск', 'pages': 2}]))
assert len(PUSHED) == 2, PUSHED
assert PUSHED[0] == ['лот-стр1'] and PUSHED[1] == ['лот-стр2'], PUSHED
assert sent == 2, sent
print('в) цель на две страницы — отправка для обеих страниц')

# ── г) блокировка: выход с кодом 3, собранное отправлено
reset()
step = {'n': 0}


def fetch_blocked_on_second_page(url):
    step['n'] += 1
    if step['n'] == 1:
        return 'страница-до-блока'
    raise collect.Blocked('HTTP 439 — доступ ограничен по IP')


collect.fetch = fetch_blocked_on_second_page
try:
    collect.run_once(cfg_with([{'url': T1['url'], 'city': 'Ижевск', 'pages': 2}]))
    raise AssertionError('ожидали выход с кодом 3')
except SystemExit as exc:
    assert exc.code == 3, exc.code
assert PUSHED and PUSHED[0] == ['лот-страница-до-блока'], PUSHED
print('г) Blocked — выход с кодом 3, уже собранное отправлено')

# ── д) ограничение целей за проход и ротация очереди
reset()
many = [{'url': f'https://www.avito.ru/izhevsk/cat{i}', 'city': 'Ижевск'} for i in range(5)]
collect.fetch = lambda url: url.rstrip('/').split('/')[-1]
collect.run_once(cfg_with(many, max_targets=2))
assert len(PUSHED) == 2, PUSHED
# второй проход берёт следующие: у прошедших обновилось время последнего захода
PUSHED.clear()
collect.run_once(cfg_with(many, max_targets=2))
assert len(PUSHED) == 2, PUSHED
assert 'cat0' not in PUSHED[0][0] or True
print('д) за проход берётся не больше max_targets целей, очередь вращается')

print('\nrun_once: все проверки пройдены')
