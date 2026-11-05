"""Поиск по ссылке с Авито (как у Avito Hunter).

Человек копирует адрес своей выдачи со всеми фильтрами — мы следим за
ней. Оживлён после того, как владелец показал модель конкурента:
Avito Hunter продаёт именно подписку на поисковые ссылки.

Запуск: python3 tests/test_link_search.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
ADP = open(os.path.join(ROOT, 'polka-final/frontend/proto/adapter.js'), encoding='utf-8').read()
TPL = open(os.path.join(ROOT, 'polka-final/frontend/proto/template.html'), encoding='utf-8').read()
IDX = open(os.path.join(ROOT, 'polka-final/frontend/proto/index.html'), encoding='utf-8').read()

ok = 0
fail = 0


def check(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print(f'ok   {name}')
    else:
        fail += 1
        print(f'FAIL {name} {extra}')


check('есть вход «Ссылка с Авито»', 'id="searchLink"' in TPL and 'id="searchLink"' in IDX)
check('разбор ссылки на сервере', 'def parse_avito_search_link(' in SRC)
check('создание критерия из ссылки', 'url: link' in ADP and '/api/hunt/from-link' in ADP)
check('ссылки больше не отбиваются как неподдержанные',
      'Ссылки с Авито больше не поддерживаются' not in SRC
      and 'Следим за вашей ссылкой с Авито' in SRC)
check('критерий хранит from_link', 'from_link=1' in SRC)
check('критерий из ссылки не режется словами', "return Decision(True, 'ok', 'по ссылке')" in SRC)
check('город не применяется к ссылкам', "return Decision(True, 'ok', 'по ссылке')" in SRC)
check('ссылка хранит исходный адрес', "row['filter_url'] = str(row.get('filter_url') or '')" in SRC)
check('есть словарь город-слаг', 'def collector_city_slugs(' in SRC)
check('подсказка про копирование адреса',
      'Скопируйте адрес из строки браузера' in TPL)
check('короткая инструкция шагами',
      'id="linkSteps"' in TPL and 'class="step"' in TPL)
check('кнопка видео-инструкции', 'id="linkTutorialBtn"' in TPL
      and 'linkTutorialBtn' in ADP)
# Ручной (словесный) поиск убран — продукт только по ссылке
check('в форме нет переключателя «искать словами»',
      'Искать словами вместо ссылки' not in ADP
      and 'Искать словами вместо ссылки' not in TPL)
check('API отвечает link_only на ручной поиск', "'error': 'link_only'" in SRC)
check('перевод пользователей на ссылки', 'link_only_migration' in SRC
      and 'link_trial_24h' in SRC)
check('в рассылке кнопка видео', 'tutorial:link' in SRC)
check('24 часа мониторинга в рассылке', '24 часа мониторинга бесплатно' in SRC)
# Цена для ссылочных поисков: Авито теряет фильтр цены при копировании ссылки
check('в форме ссылки есть цена от/до',
      'id="linkPriceFrom"' in TPL and 'id="linkPriceTo"' in TPL)
check('форма отправляет цену в from-link',
      'max_price: pTo' in ADP and "'/api/hunt/from-link'" in ADP)
check('from-link принимает цену полями',
      '_body_pmax' in SRC and '_pmax = _body_pmax or' in SRC)
check('ссылочный поиск уважает границу цены',
      'if _pmax and price > _pmax' in SRC and "no('price_to')" in SRC)
check('предупреждение, если в ссылке нет цены',
      'В ссылке не видно фильтра цены' in SRC)
check('админ может поправить цену поиска',
      "action == 'set_crit_price'" in SRC)
check('эндпоинт видео-инструкции', "'/api/tutorial/link'" in SRC)
check('бот отправляет ролик в чат', 'async def send_link_tutorial(' in SRC
      and 'tutorial-link.mp4' in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
