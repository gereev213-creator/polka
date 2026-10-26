"""Миграция колонок: каждая добавляется отдельно, повторный запуск безопасен."""
import os, re, sqlite3, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

i = SRC.index('def ensure_filter_blob_column')
j = SRC.index('def add_criterion', i)
body = SRC[i:j]

checks = []
checks.append(("колонки идут по одной", body.count('ALTER TABLE') == 1 and 'for column in' in body))
checks.append(("проверка существования", "pragma_table_info" in body))
checks.append(("нет общего try на две колонки", 'filter_blob TEXT DEFAULT \'\'\")\n        db.conn.execute(\"ALTER TABLE hunt_criteria ADD COLUMN filter_url' not in body))

# рабочий прогон на копии схемы
c = sqlite3.connect('/tmp/mig_test2.db')
c.execute('CREATE TABLE IF NOT EXISTS hunt_criteria (id INTEGER PRIMARY KEY, query TEXT)')
c.commit()
ns = {'re': re,
      'db': type('D', (), {'conn': c})(),
      'logger': type('L', (), {'info': staticmethod(lambda *a: None),
                               'warning': staticmethod(lambda *a: None)})()}
exec(body, ns)
ns['ensure_filter_blob_column']()
cols = {r[1] for r in c.execute("PRAGMA table_info('hunt_criteria')")}
checks.append(("обе колонки появились", {'filter_blob', 'filter_url'} <= cols))
ns['ensure_filter_blob_column']()
checks.append(("повторный запуск не падает", True))
c.close()
os.remove('/tmp/mig_test2.db')

ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nмиграция: проверки пройдены' if ok else '\nмиграция: есть пропуски')
sys.exit(0 if ok else 1)
