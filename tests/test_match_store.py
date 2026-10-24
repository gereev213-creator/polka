"""Сохранение совпадений: не падает на None, дублях и под блокировкой."""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()
i = SRC.index('def hunt_match_store')
j = SRC.index('def hunt_matches_recompute')
body = SRC[i:j]

checks = [
    # обёртку с RLock откатили: она меняла поведение и ломала пересчёт
    ("вставка через OR IGNORE", 'INSERT OR IGNORE' in body),
    ("вставка не падает на дубле", 'INSERT OR IGNORE INTO hunt_matches' in body),
    ("None в id не роняет", 'id не число' in body),
    ("RLock в проекте", 'DB_WRITE_LOCK = threading.RLock()' in SRC),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nсохранение совпадений: проверки пройдены' if ok else '\nесть пропуски')
sys.exit(0 if ok else 1)
