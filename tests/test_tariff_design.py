"""Дизайн тарифов: спокойный список вместо градиентной «ИИ-карточки».

Владелец: «слишком ИИ-шно, не вижу PRO». Сделали по правилам ремесла
(stageshow: restraint, hierarchy, neutral surfaces, one accent, real words):
- список тарифов строками, цена справа, без чипов-пилюль;
- PRO первым блоком «Для перекупов»;
- одна акцентная карточка выбора с кнопкой, без градиента;
- дубля цены рядом с кнопкой больше нет.

Запуск: python3 tests/test_tariff_design.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
PAY = open(os.path.join(ROOT, 'polka-final/frontend/proto/payments.js'), encoding='utf-8').read()
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


# разметка
check('нет градиентной карточки .plus в тарифах', 'class="plus"' not in TPL)
check('есть карточка выбранного плана', 'class="card plan-card"' in TPL)
check('кнопка оплаты на месте', 'id="payBtn"' in TPL)
check('цена только в кнопке (нет priceNow)', 'id="priceNow"' not in TPL)
check('ссылка на удалённый termsBtn не падает', "if(_termsBtn)" in TPL)

# витрина
check('витрина — только мониторинг ссылок',
      "VISIBLE_PRODUCTS = ['link_1_30', 'link_2_30', 'link_3_30', 'link_5_90']" in PAY)
check('группа «Для перекупов»', "'Для перекупов'" in PAY)
check('группа «Мониторинг ссылок с Авито»', "'Мониторинг ссылок с Авито'" in PAY)
check('старые пакеты убраны из витрины', "'unlimited_30', 'pack_5'" not in PAY)
check('метка PRO', "'<span class=\"tag\">для перекупов</span>'" in PAY or 'для перекупов</span>' in PAY)
check('цены в строках', "class=\"pp\"" in PAY)
check('подпись выбранного плана с периодом', "+ ' · ' + _periodTxt" in PAY)

# спокойный стиль
check('фон приложения, а не серый', '#s-tariffs .scroll{background:transparent}' in TPL)
check('карточки в стиле .card', '#s-tariffs .trial{background:#fff;border-radius:24px;box-shadow:var(--sh)' in TPL)
check('акцент только на кнопке', 'background:var(--grad)' in TPL)
check('собранная страница содержит новый дизайн', 'class="card plan-card"' in IDX)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
