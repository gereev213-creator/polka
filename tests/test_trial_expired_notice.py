"""Уведомление «пробный закончился»: текст с конкретной выгодой.

Проверяем саму функцию текста (вытаскиваем из модуля через AST и подставляем
заглушки), не поднимая бота и не трогая базу.

Запуск: python3 tests/test_trial_expired_notice.py
"""
import ast
import html
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_PATH = os.path.join(HERE, '..', 'polka_bot-9-3.py')
SRC = open(SRC_PATH, encoding='utf-8').read()

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


# Достаём функцию из исходника и исполняем с заглушками
tree = ast.parse(SRC)
fn = next((n for n in tree.body
           if isinstance(n, ast.FunctionDef) and n.name == '_trial_expired_caption'), None)
check('функция текста найдена', fn is not None)
code = ast.get_source_segment(SRC, fn)
ns = {
    'Dict': dict,
    '_html': html,
    '_money': lambda v: f"{int(v or 0):,}".replace(',', ' '),
    '_hunt_escape': lambda v: html.escape(str(v or '')),
}
exec(code, ns)
cap = ns['_trial_expired_caption']

# 1) есть находки — показываем лучшую с выгодой
text = cap('айфоны', {'sent': 3, 'checked': 2899,
                      'best': {'title': 'iPhone 15 Pro, 128 ГБ',
                               'price': 24800, 'discount': 28,
                               'url': 'https://avito.ru/x'}})
check('пишет, сколько находок прислали', 'прислали <b>3</b> находок' in text)
check('называет лучшую находку', 'iPhone 15 Pro, 128 ГБ' in text)
check('показывает цену', '24 800 ₽' in text)
check('показывает выгоду к рынку', 'на 28% ниже рынка' in text)
check('ссылка не засоряет текст (она в кнопке)', 'https://avito.ru/x' not in text)
check('предлагает Плюс', '«Плюсе»' in text)

# 2) находок не было, но объявления проверяли — честный текст
text2 = cap('rick owens', {'sent': 0, 'checked': 2899, 'best': {}})
check('пишет, сколько проверили', 'проверили <b>2899</b> объявлений' in text2)
check('честно про отсутствие находок', 'не нашлось' in text2)
check('не врёт про находки', 'прислали' not in text2)

# 3) вообще ничего не проверяли
text3 = cap('товар', {'sent': 0, 'checked': 0, 'best': {}})
check('третий случай: новых объявлений не было', 'не появилось' in text3)

# 4) экранирование: ни запрос, ни заголовок не ломают HTML
text4 = cap('<b>hack</b>', {'sent': 1, 'checked': 1,
                            'best': {'title': '<i>x</i>', 'price': 100,
                                     'discount': 0, 'url': ''}})
check('запрос экранирован', '&lt;b&gt;hack&lt;/b&gt;' in text4)
check('заголовок экранирован', '&lt;i&gt;x&lt;/i&gt;' in text4)
check('без дискаунта не врёт про выгоду', 'ниже рынка' not in text4)

# 4б) уведомление о продлении: объясняет, что продлили бесплатно
fn2 = next((n for n in tree.body
            if isinstance(n, ast.FunctionDef) and n.name == '_trial_extended_caption'), None)
check('функция текста продления найдена', fn2 is not None)
ns2 = {'Dict': dict, '_html': html,
       '_money': lambda v: f"{int(v or 0):,}".replace(',', ' '),
       '_hunt_escape': lambda v: html.escape(str(v or ''))}
exec(ast.get_source_segment(SRC, fn2), ns2)
cap_ext = ns2['_trial_extended_caption']

t_ext = cap_ext('айфоны', {'sent': 0, 'checked': 2899, 'best': {}})
check('продление: сообщает о +24 часах', 'ещё на 24 часа' in t_ext)
check('продление: объясняет причину', 'не нашлось' in t_ext)
check('продление: пишет, сколько проверили', 'проверили <b>2899</b>' in t_ext)
check('продление: говорит, что платить не нужно', 'Платить пока не нужно' in t_ext)

t_ext0 = cap_ext('товар', {'sent': 0, 'checked': 0, 'best': {}})
check('продление без проверок: честно про пустоту', 'пока не было' in t_ext0)
check('продление экранирует запрос', '&lt;' in cap_ext('<b>x</b>', {'checked': 0}))
check('есть предпросмотр продления', "action == 'notify_extend_test'" in SRC)
check('продление уведомляет из циклов', '_notify_trial_extended(row.get' in SRC)

# 5) сквозные связи в коде
check('статистика по критерию есть', 'def _trial_expired_stats(' in SRC)
check('считает отправленные', "status='sent'" in SRC)
check('берёт лучший лот по выгоде', 'ORDER BY COALESCE(hm.discount,0) DESC' in SRC)
check('уведомление принимает критерий', 'async def _notify_trial_expired(user_id: int, query: str, crit_id: int = 0)' in SRC)
check('пауза передаёт id критерия', "{'id': int(r['id']), 'user_id': uid" in SRC)
check('кнопка «Открыть находку» есть', 'Открыть находку' in SRC)
check('кнопка ведёт на ссылку находки', "'url': best_url" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
