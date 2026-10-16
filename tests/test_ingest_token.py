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
# Читать ?token= разрешено ТОЛЬКО в двух помощниках: приём (INGEST) и
# диагностика (ADMIN_READ). Ни один обработчик не должен делать это сам —
# иначе токен снова начнёт утекать в логи и историю.
import re as _re


def _enclosing(lines, n):
    for i in range(n - 1, 0, -1):
        m = _re.match(r'def ([A-Za-z_0-9]+)', lines[i - 1])
        if m:
            return m.group(1)
    return ''


_lines = SRC.split('\n')
_reads = [(n, _enclosing(_lines, n)) for n, line in enumerate(_lines, 1)
          if "query.get('token'" in line]
_handlers = [(n, fn) for n, fn in _reads
             if fn not in ('_ingest_token_ok', '_admin_read_token_ok')]
assert not _handlers, f'обработчик читает ?token= напрямую: {_handlers}'
assert len(_reads) == 2, f'ожидали чтение только в двух помощниках: {_reads}'
import os as _os
_os.environ.pop('ALLOW_QUERY_TOKEN', None)
print('D9: ?token= читают только два помощника (приём и диагностика), '
      'обработчики — нет')
