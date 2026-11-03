"""Опрос в боте: два вопроса, кнопки, бонус за ответ.

Внешняя форма на 39 вопросов дала 0 ответов за 10 часов. Здесь короткий
опрос в чате: ответ в один тап, за оба ответа — +1 поиск на 7 дней.

Запуск: python3 tests/test_survey.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()

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


# вопросы
check('два вопроса, не 39', 'SURVEY_Q1' in SRC and 'SURVEY_Q2' in SRC)
check('варианты ответов кнопками', 'callback_data=f\'survey:{num}:{code}\'' in SRC)
check('обработчик зарегистрирован', r'pattern=r"^survey:\d+:[a-z0-9_]+$"' in SRC)
check('ответы пишутся в события', "f'survey_q{num}'" in SRC)
check('отметка «ответил» есть', 'survey.done:' in SRC)
check('бонус за ответ: +1 поиск на 7 дней',
      "timedelta(days=7)" in SRC and "'survey_bonus'" in SRC)

# админ-действия
check('предпросмотр на себе', "action == 'survey_test'" in SRC)
check('предпросмотр только админам', "test_only_admin" in SRC)
check('статистика ответов', "action == 'survey_stats'" in SRC)
check('рассылка опроса по когорте', "action == 'survey_send'" in SRC)
check('рассылка пропускает ответивших и заблокированных',
      '_survey_done(uid)' in SRC and 'uid in blocked' in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
