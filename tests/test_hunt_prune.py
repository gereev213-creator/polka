"""Чистка совпадений: удаляем только «не подошло», строго по пользователю."""
import os, re, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

checks = []
# 1. Видимость описана один раз и включает то, что лента реально показывает
checks.append(("константа видимости", 'HUNT_VISIBLE_SQL' in SRC))
checks.append(("подозрительно дешёвые видны",
               "'price_below_floor','price_suspect'" in SRC))
checks.append(("статусы ленты на месте",
               "status IN ('ready','sent','sending','pending_details','send_failed')" in SRC))
# 2. Удаляем только невидимое
checks.append(("удаление неподходящих через NOT", 'WHERE NOT ({HUNT_VISIBLE_SQL})' in SRC))
# 3. Прореживание — по паре пользователь+критерий, а не по объявлению
checks.append(("партиция по user_id и crit_id",
               'PARTITION BY user_id, crit_id' in SRC))
checks.append(("нет глобального удаления по ad_id",
               'DELETE FROM hunt_matches WHERE ad_id' not in SRC))
# 4. Одинаковые критерии у разных людей не смешиваются
checks.append(("ключ учитывает пользователя",
               'hm.user_id = ?' in SRC and 'PARTITION BY user_id' in SRC))

ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nчистка совпадений: правила верные' if ok else '\nчистка: есть ошибки')
sys.exit(0 if ok else 1)
