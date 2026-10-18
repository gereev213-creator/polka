"""Проверка: статусы заявки CISPay обрабатываются и на клиенте, и на сервере."""
import re, sys
src = open('polka_bot-9-3.py', encoding='utf-8').read()
jsx = open('polka-final/frontend/src/App.jsx', encoding='utf-8').read()

checks = []
# сервер: опрос покрывает статусы проверки
m = re.search(r"SELECT order_uuid FROM payments WHERE credited=0[\s\S]{0,400}?status IN \(([^)]*)\)", src)
poll = m.group(1) if m else ''
for st in ('waiting', 'pending', 'processing', 'moderation'):
    checks.append((f'сервер опрашивает {st}', st in poll))
# клиент: обрабатывает отклонение и проверку
checks.append(('клиент знает про отклонение', "'rejected', 'canceled', 'declined', 'failed'" in jsx))
checks.append(('клиент знает про проверку', "'pending', 'processing', 'moderation', 'checking', 'review'" in jsx))
checks.append(('есть кнопка новой заявки', 'Новая заявка' in jsx))
checks.append(('окно опроса 30 минут', 'tries >= 120' in jsx))

ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nитог:', 'все проверки пройдены' if ok else 'есть проблемы')
sys.exit(0 if ok else 1)
