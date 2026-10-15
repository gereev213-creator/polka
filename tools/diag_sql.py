"""Диагностика живой базы: причины отказов, застрявшие, что уходит в чат.

Запуск: python3 .work/diag_sql.py
Токен берётся из collector/config.json (тот же, что INGEST_TOKEN на Амвере).
"""
import json
import os
import sys
import time
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(HERE, '..', 'collector', 'config.json')
cfg = json.load(open(CFG, encoding='utf-8'))
SERVER = cfg['server'].rstrip('/')
TOKEN = cfg['token']

QUERIES = [
    ("1) Причины отказа за сутки", """
        SELECT reason, COUNT(*) AS n FROM hunt_matches
        WHERE status='rejected' AND updated_at >= '2026-10-14'
        GROUP BY reason ORDER BY n DESC
    """),
    ("2) Застрявшие в отправке", """
        SELECT id, updated_at, reason FROM hunt_matches WHERE status='sending'
    """),
    ("3) Что уходит в чат (последние 60)", """
        SELECT c.query, a.title, a.price
        FROM hunt_matches m
        JOIN hunt_criteria c ON c.id=m.crit_id
        JOIN ads a ON a.id=m.ad_id
        WHERE m.status='sent' ORDER BY m.id DESC LIMIT 60
    """),
    ("4) Отправлено на каждый критерий", """
        SELECT m.crit_id, c.query, COUNT(*) AS n
        FROM hunt_matches m LEFT JOIN hunt_criteria c ON c.id=m.crit_id
        WHERE m.status='sent' AND m.updated_at >= '2026-10-14'
        GROUP BY m.crit_id ORDER BY n DESC
    """),
]


def call(sql, timeout=60):
    """Через curl: у локального Python на macOS нет корневых сертификатов."""
    payload = json.dumps({'sql': sql})
    proc = subprocess.run(
        ['curl', '-s', '--max-time', str(timeout), '-X', 'POST',
         f'{SERVER}/api/admin/sql',
         '-H', f'X-Ingest-Token: {TOKEN}',
         '-H', 'Content-Type: application/json',
         '--data-binary', '@-'],
        input=payload.encode(), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode()[:120] or 'curl failed')
    return json.loads(proc.stdout.decode() or '{}')


def wait_ready(attempts=20, pause=30):
    for i in range(1, attempts + 1):
        try:
            out = call('SELECT 1 AS ready', timeout=20)
            if out.get('ok'):
                print(f'сервер готов (попытка {i})\n')
                return True
        except Exception as e:
            last = str(e)[:80]
            print(f'  попытка {i}: {last}')
        time.sleep(pause)
    return False


def show(title, out):
    print('=' * 70)
    print(title)
    if not out.get('ok'):
        print('  ошибка:', out.get('error'), out.get('detail', ''))
        return
    cols, rows = out.get('columns') or [], out.get('rows') or []
    if not rows:
        print('  (пусто)')
        return
    print('  ' + ' | '.join(str(c) for c in cols))
    for r in rows:
        print('  ' + ' | '.join('' if r.get(c) is None else str(r.get(c))[:38] for c in cols))
    print(f'  всего строк: {out.get("count")}')


if __name__ == '__main__':
    if not wait_ready():
        print('сервер не ответил — возможно, ещё собирается')
        sys.exit(1)
    for title, sql in QUERIES:
        try:
            show(title, call(sql))
        except Exception as e:
            print('=' * 70)
            print(title)
            print('  сбой запроса:', str(e)[:160])
        print()
