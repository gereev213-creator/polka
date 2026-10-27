"""Критерий из ссылки Авито: разбор адреса и передача фильтров сборщику."""
import os, sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()
JSX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'polka-final/frontend/src/HuntChat.jsx'), encoding='utf-8').read()
API = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'polka-final/frontend/src/api.js'), encoding='utf-8').read()
APP = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'polka-final/frontend/src/App.jsx'), encoding='utf-8').read()

checks = [
    ("парсер ссылки существует", 'def parse_avito_filter_url(' in SRC),
    ("эндпоинт from-link", "'/api/hunt/from-link'" in SRC),
    ("принимает url из тела", "url = str((body or {}).get('url') or '')" in SRC),
    ("требует фильтры в ссылке", "'no_filters'" in SRC),
    # миграция переписана: колонки добавляются циклом по списку
    ("колонка filter_blob", "'filter_blob'" in SRC and 'ALTER TABLE hunt_criteria' in SRC),
    ("колонка filter_url", "'filter_url'" in SRC),
    ("blob сохраняется в критерии", 'UPDATE hunt_criteria SET filter_blob=?' in SRC),
    ("сборщик получает filters", "row['filters'] = str(row.get('filter_blob')" in SRC),
    ("выборка отдаёт filter_blob", "COALESCE(filter_blob,'')" in SRC),
    ("дубль не создаётся", 'AND filter_blob=?' in SRC),
    # экран ссылки переехал из чата в отдельный компонент /hunt,
    # поэтому проверяем его по App.jsx, а не по HuntChat
    # Форму ссылки убрали с экрана: основной путь — слова. Код разбора ссылки
    # и клиентский вызов сохранены, поэтому проверяем их, а не разметку формы.
    ("разбор ссылки жив", 'huntFromLink' in APP and 'huntFromSearchLink' in APP),
    ("вкладки убраны", 'chat-tabs' not in JSX),
    ("клиент зовёт эндпоинт", 'huntFromLink' in API),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nкритерий из ссылки: всё на месте' if ok else '\nесть пропуски')
sys.exit(0 if ok else 1)
