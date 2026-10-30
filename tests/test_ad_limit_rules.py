"""Правила публикации: бесплатно — одно объявление за всё время, Плюс — безлимит."""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()

i = SRC.index('Лимит лотов') if 'Лимит лотов' in SRC else SRC.index('Без подписки — только одно')
j = SRC.index('photos = body.get', i)
body = SRC[i:j]

checks = [
    ('бесплатно считается по всем объявлениям',
     'SELECT COUNT(*) AS c FROM ads WHERE user_id=?' in body),
    ('сутки больше не считаются', 'created_at,\'\') >= ?' not in body),
    ('Плюс без ограничений', '_is_plus = _plan in' in body and "'plus', 'pro'" in body),
    ('текст про одно объявление', 'только одно объявление' in body),
]
fails = 0
for name, ok in checks:
    print(f"  {'✓' if ok else '✗'} {name}")
    if not ok:
        fails += 1
print('\nправила публикации: на месте' if not fails else '\nправила публикации: есть пропуски')
sys.exit(0 if not fails else 1)
