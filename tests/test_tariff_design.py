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
check('конструктор внутри карточки тарифа',
      'id="planChipsBox"' in TPL and 'class="card plan-card" id="planCard"' in TPL)
check('цена крупно и пересчитывается', 'id="planPrice"' in TPL and 'cprice' in TPL)
check('кнопка оплаты на месте', 'id="payBtn"' in TPL)
check('старые чипы-списки убраны из разметки', 'class="tarwrap"' not in TPL)
check('подписи: ссылки и срок', "'Сколько ссылок'" in PAY and "'Срок'" in PAY)
check('бесплатная плашка', 'Бесплатно' in TPL)
check('бейдж PRO у пяти ссылок', "Number(val) === 5 ? 'PRO'" in PAY)
check('период и цена в одном месте', "id=\"planPeriod\"" in TPL and 'daysWord(days)' in PAY)
check('экономия выводится плашкой', "id=\"planSave\"" in TPL and 'savingsFor' in PAY)

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
