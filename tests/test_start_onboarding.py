"""Первый вход: без требования подписки, с описанием сервиса и кнопкой триала.

Правило продукта: бот не просит подписаться на канал. В /start он объясняет,
что это за сервис, даёт кнопку «Активировать бесплатный период», а канал
упоминает просто как источник новостей.

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


# 1) шлагбаум подписки убран
check('нет текста «Для доступа к боту подпишитесь»',
      'Для доступа к боту подпишитесь' not in SRC)
check('нет блокировки в middleware',
      'Не подписан — пускаем только /start' not in SRC)
check('нет блокировки при создании объявления',
      'Сначала подпишитесь на канал!' not in SRC)

# 2) приветствие объясняет сервис
check('приветствие описывает сервис', 'находим объявления дешевле рынка' in SRC)
check('приветствие обещает бесплатный поиск', 'один поиск бесплатно на 24 часа' in SRC)
check('канал упомянут как новости', 'Новости сервиса и лучшие находки дня' in SRC)

# 3) кнопка активации пробного периода
check('кнопка активации в /start', 'callback_data="start_trial"' in SRC)
check('обработчик активации есть', 'async def start_trial_callback(' in SRC)
check('обработчик зарегистрирован', 'pattern="^start_trial$"' in SRC)
check('после активации открывается приложение', 'Бесплатный период активирован' in SRC)

# 4) deep links не сломаны
check('deep links обрабатываются', "if not (deep_link_action or deep_link_ad_id):" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
