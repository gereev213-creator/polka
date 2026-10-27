"""Проверка объявления моделью: разбор ответа да/нет, кэш, отказ по «нет».

Функции берём из исходника и подставляем заглушки — так тест не требует
ни базы, ни токена бота, ни ключа модели.
"""
import asyncio
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()

ok = 0
fail = 0


def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'ok   {name}')
    else:
        fail += 1
        print(f'FAIL {name}  {extra}')


check('промпт требует только да/нет', 'Ответь только «да» или «нет»' in SRC)
check('тип товара назван в промпте', 'джинсы — это не шапка' in SRC)
check('кэш объявлений есть', 'llm_cache' in SRC)
check('проверка включается настройкой', "'hunt.llm'" in SRC)
check('у отказа своя причина', "'llm_rejected'" in SRC)


def grab(start: str, stop: str) -> str:
    i = SRC.index(start)
    j = SRC.index(stop, i + 10)
    return SRC[i:j]


ns = {'asyncio': asyncio, 'Optional': object, 'Dict': dict,
      'datetime': __import__('datetime').datetime,
      'timezone': __import__('datetime').timezone,
      '_hashlib': __import__('hashlib'), 'logger': type('L', (), {
          'warning': staticmethod(lambda *a: None)})(),
      'db': None}
code = (grab('_LLM_MATCH_PROMPT = (', 'def _llm_match_cached')
        + grab('def _llm_match_cached', 'def _llm_match_store')
        + grab('def _llm_match_store', 'async def llm_matches_ad')
        + grab('async def llm_matches_ad', 'def _llm_match_sync'))
exec(code, ns)

seen = {'n': 0}


async def fake_llm(messages, max_tokens=6, temperature=0, system=''):
    seen['n'] += 1
    text = messages[0]['content']
    return 'да' if 'Джинсы' in text else 'нет'


ns['_llm_completion'] = fake_llm
ns['_llm_match_cached'] = lambda *a: ''
stored = {}
ns['_llm_match_store'] = lambda title, q, p, v: stored.__setitem__(title, v)

r1 = asyncio.run(ns['llm_matches_ad']({'title': "Джинсы Levi's 501", 'price': 2000},
                                      {'query': 'джинсы levis'}))
check('джинсы модель пропускает', r1 is True, r1)
r2 = asyncio.run(ns['llm_matches_ad']({'title': 'Шапки Levis из США', 'price': 2600},
                                      {'query': 'джинсы levis'}))
check('шапки модель отклоняет', r2 is False, r2)
check('вердикт записан в кэш', "Джинсы Levi's 501" in stored, stored)

# ответ модели не по формату — решение не выносим
async def weird(messages, **k):
    return 'не уверен'


ns['_llm_completion'] = weird
r3 = asyncio.run(ns['llm_matches_ad']({'title': 'Джинсы', 'price': 100}, {'query': 'джинсы'}))
check('непонятный ответ не считается отказом', r3 is None, r3)

# без ключа модель падает — тоже не отказ
async def boom(messages, **k):
    raise RuntimeError('no key')


ns['_llm_completion'] = boom
r4 = asyncio.run(ns['llm_matches_ad']({'title': 'Джинсы', 'price': 100}, {'query': 'джинсы'}))
check('ошибка модели не блокирует находку', r4 is None, r4)


# ── перебор моделей ────────────────────────────────────────────────────────
tried = []


async def first_dead(messages, **k):
    tried.append('1')
    raise RuntimeError('model unavailable')


async def second_ok(messages, **k):
    tried.append('2')
    return 'да'


ns['_setting_get'] = lambda k, d='': 'model-a,model-b'
ns['_llm_match_cached'] = lambda *a: ''

# обе модели падают → решения нет, правила решат сами
ns['_llm_completion'] = first_dead
r5 = asyncio.run(ns['llm_matches_ad']({'title': 'Джинсы Levis', 'price': 1000},
                                      {'query': 'джинсы levis'}))
check('все модели упали — решения нет', r5 is None, r5)
check('попыток было по числу моделей', len(tried) >= 2, tried)

# первая падает, вторая отвечает → решение есть
tried.clear()


async def second_yes(messages, **k):
    if len(tried) == 0:
        tried.append('a')
        raise RuntimeError('nope')
    tried.append('b')
    return 'да'


ns['_llm_completion'] = second_yes
r6 = asyncio.run(ns['llm_matches_ad']({'title': 'Джинсы Levis 501', 'price': 1500},
                                      {'query': 'джинсы levis'}))
check('первая упала — вторая ответила', r6 is True, r6)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
