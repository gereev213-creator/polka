"""Тесты этапа D9: токен сборщика только в заголовке.

В query (?token=) токен попадал в логи прокси и в историю — по умолчанию
он больше не принимается. Переходный период — ALLOW_QUERY_TOKEN=1.

Запуск: python3 tests/test_ingest_token.py
"""
import os
import re
import sys
from typing import Dict, List, Optional, NamedTuple

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(BOT, encoding='utf-8').read()

i = SRC.index('def _ingest_token_ok(')
j = re.compile(r'^(async )?def ', re.M).search(SRC, i + 5)
ns = {'os': os}
exec(SRC[i:j.start()], ns)
token_ok = ns['_ingest_token_ok']


class Req:
    def __init__(self, header='', query_token=''):
        self.headers = {'X-Ingest-Token': header} if header else {}
        self.query = {'token': query_token} if query_token else {}


os.environ.pop('ALLOW_QUERY_TOKEN', None)
assert token_ok(Req(header='secret')) == 'secret', 'заголовок не приняли'
assert token_ok(Req(query_token='secret')) == '', 'query-токен приняли без флага'
assert token_ok(Req()) == ''
print('D9: по умолчанию принимается только заголовок X-Ingest-Token')

os.environ['ALLOW_QUERY_TOKEN'] = '1'
assert token_ok(Req(query_token='secret')) == 'secret', 'переходный флаг не работает'
assert token_ok(Req(header='h', query_token='q')) == 'h', 'заголовок должен быть приоритетнее'
os.environ.pop('ALLOW_QUERY_TOKEN', None)
print('D9: ALLOW_QUERY_TOKEN=1 возвращает старый способ (переходный период)')

# Ни в одном обработчике не осталось чтения токена из query напрямую
bad = [n for n, line in enumerate(SRC.split('\n'), 1)
       if "query.get('token'" in line and '_ingest_token_ok' not in line
       and 'request.query.get' in line and n < SRC[:i].count('\n') + 1]
extra = [n for n, line in enumerate(SRC.split('\n'), 1)
         if "query.get('token'" in line and 'def _ingest_token_ok' not in line]
assert len(extra) == 1, f'остались прямые чтения токена из query: {extra}'
print('D9: прямых чтений ?token= в обработчиках не осталось')
