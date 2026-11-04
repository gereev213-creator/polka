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
# Живой Mini App — это прототип proto/, а не React-сборка: Docker копирует
# proto/index.html поверх dist. Поэтому точный режим проверяем здесь.
TPL = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'polka-final/frontend/proto/template.html'), encoding='utf-8').read()
ADP = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                        'polka-final/frontend/proto/adapter.js'), encoding='utf-8').read()

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
    ("дубль не создаётся", "filter_url=? OR (COALESCE(filter_url,'')=''" in SRC),
    # экран ссылки переехал из чата в отдельный компонент /hunt,
    # поэтому проверяем его по App.jsx, а не по HuntChat.
    # Форму ссылки одно время убрали с экрана (коммит 21b1f3f), и сборщик
    # остался без точного режима: искал по разделу вслепую. Вернули — тест
    # теперь стережёт, чтобы поле ввода ссылки не исчезло снова.
    ("разбор ссылки жив", 'huntFromLink' in APP and 'huntFromSearchLink' in APP),
    ("форма ссылки на экране", 'hunt-field' in APP and 'hunt-paste' in APP),
    ("кнопка отправки ссылки", 'onClick={send}' in APP),
    ("вкладки убраны", 'chat-tabs' not in JSX),
    ("клиент зовёт эндпоинт", 'huntFromLink' in API),
    # Живой мини-апп — proto/: в React-сборку смотрит только админка.
    ("поле ссылки в живом мини-аппе", 'id="searchLink"' in TPL),
    ("плашки разбора ссылки", '#linkChips' in TPL and 'getElementById(\'linkChips\')' in ADP),
    ("форма отправляет только ссылку", "const link = linkEl ? String(linkEl.value || '').trim() : ''" in ADP
     and "'/api/hunt/from-link'" in ADP),
    ("новый разбор ссылки первым", ADP.index("/api/hunt/from-link") < ADP.index("search_link: link")),
    # Ручной режим расширен: словами теперь ищет сам Авито (q=), поэтому
    # человеку нужны цена от/до, город, состояние, минус-слова, выгода и фото.
    ("поле цены от", 'id="minprice"' in TPL),
    ("поле города", 'id="city"' in TPL),
    ("состояние", 'id="condChips"' in TPL),
    ("минус-слова", 'id="exclude"' in TPL),
    ("выгода к рынку", 'id="discChips"' in TPL),
    ("только с фото", 'id="photoChip"' in TPL),
]
ok = True
for name, res in checks:
    print(f"  {'✓' if res else '✗'} {name}")
    ok = ok and res
print('\nкритерий из ссылки: всё на месте' if ok else '\nесть пропуски')
sys.exit(0 if ok else 1)
