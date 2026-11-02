"""Первый вход: сразу меню, без простыни, приветствие по имени.

Правило владельца: на /start человек сразу получает меню (не длинное
описание сервиса), а в меню вместо заголовка «Полка» — «Привет, имя».
Канал больше не требуется для доступа.

Запуск: python3 tests/test_start_onboarding.py
"""
import os
import sys

SRC = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'polka_bot-9-3.py'),
           encoding='utf-8').read()

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


# 1) шлагбаума подписки больше нет
check('нет текста «Для доступа к боту подпишитесь»',
      'Для доступа к боту подпишитесь' not in SRC)
check('нет блокировки при создании объявления',
      'Сначала подпишитесь на канал!' not in SRC)

# 2) /start сразу открывает меню
check('/start ведёт в главное меню',
      'return await show_main_menu(update, context)' in SRC)
check('длинного описания сервиса в /start нет',
      'Что внутри:' not in SRC and 'ПОЛКА — находим объявления дешевле рынка' not in SRC)

# 3) меню здоровается по имени вместо «Полка»
i = SRC.index('async def show_main_menu(')
j = SRC.index('\n# ', i)
menu = SRC[i:j]
check('приветствие по имени', 'Привет, {_name}' in menu)
check('заголовка «Полка» в меню нет', '<b>Полка</b>' not in menu)
check('имя берётся у пользователя', 'first_name' in menu)

# 4) приветственный бонус для первого входа
check('бонус только для новых', '_first_time = not bool(user_data)' in SRC)
check('текст про бонус', 'Приветственный бонус' in SRC)
check('бонус — один бесплатный поиск без срока', 'один поиск лота' in SRC and 'бесплатно на 24 часа' not in SRC)
check('кнопка активации под текстом', '🎁 Активировать бонус' in SRC)
check('кнопка ведёт в start_trial', 'callback_data="start_trial"' in SRC)
check('после активации открывается приложение', 'Бонус активирован' in SRC)

# 5) deep links не сломаны
check('deep links обрабатываются', 'if not (deep_link_action or deep_link_ad_id):' in SRC)

# 6) тексты бонуса — без обещаний «про карту»
check('нет «без карты и без подписки»', 'без карты и без подписки' not in SRC)
check('нет «Карта не нужна»', 'Карта не нужна' not in SRC)
check('инструкция: открой приложение и создай поиск',
      'создайте первый поиск лота' in SRC)
check('Плюс не понижается старой кнопкой',
      'У вас уже активен «Плюс»' in SRC and '_plus_subscription' in SRC)
check('активация бонуса проверяет подписку',
      'has_plus = bool(_plus_subscription(int(user.id)))' in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
