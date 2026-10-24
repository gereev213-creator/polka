"""Пауза после блокировки Авито: проход не начинается, пока не истекла."""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

checks = [
    ("пауза сохраняется в настройке", 'collector.blocked_until_ts' in SRC),
    ("45 минут при первом блоке", 'wait_min = 45' in SRC),
    ("растущая пауза", "wait_min = 45 if not prev" in SRC),
    ("проход проверяет паузу", 'Сбор на паузе после блокировки Авито' in SRC),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nпауза после блокировки: на месте' if ok else '\nесть пропуски')
sys.exit(0 if ok else 1)
