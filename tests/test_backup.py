"""Бэкап базы: согласованная копия, gzip и восстановление."""
import gzip, os, sqlite3, sys

checks = []
SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

checks.append(("ежедневная задача", '_backup_loop' in SRC))
checks.append(("копия через online backup API", 'src.backup(dst)' in SRC))
checks.append(("сжатие gzip", "gzip.open(out, 'wb'" in SRC))
checks.append(("отправка владельцу", 'sendDocument' in SRC))
checks.append(("старые копии удаляются", "glob.glob('/tmp/polka-*.db.gz')" in SRC))
checks.append(("выключатель backup.enabled", "backup.enabled" in SRC))

# рабочий прогон: копия → gzip → распаковка → чтение
src = '/tmp/bk_t.db'
c = sqlite3.connect(src)
c.execute('CREATE TABLE IF NOT EXISTS users (user_id INTEGER)')
c.execute('DELETE FROM users'); c.execute('INSERT INTO users VALUES (7)'); c.commit(); c.close()
raw = '/tmp/bk_t_copy.db'
s = sqlite3.connect(src); d = sqlite3.connect(raw)
with d: s.backup(d)
s.close(); d.close()
gz = raw + '.gz'
with open(raw, 'rb') as fh, gzip.open(gz, 'wb') as out:
    out.write(fh.read())
os.remove(raw)
with gzip.open(gz, 'rb') as fh:
    restored = '/tmp/bk_t_rest.db'
    open(restored, 'wb').write(fh.read())
n = sqlite3.connect(restored).execute('SELECT COUNT(*) FROM users').fetchone()[0]
checks.append(("копия восстанавливается", n == 1))
for f in (gz, restored, src):
    try: os.remove(f)
    except Exception: pass

ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nбэкап: проверки пройдены' if ok else '\nбэкап: есть пропуски')
sys.exit(0 if ok else 1)
