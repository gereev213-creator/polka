"""Вариант A: один бесплатный поиск навсегда, без «пробного».

Правило: новый человек получает бесплатный доступ с одним активным
поиском; поиск работает без ограничения по времени. «Плюс» — до 10
поисков и находки сразу.

Запуск: python3 tests/test_free_plan_forever.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
ADP = open(os.path.join(ROOT, 'polka-final/frontend/proto/adapter.js'), encoding='utf-8').read()
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


# 1) суточная пауза выключена по умолчанию
check('настройка free.ttl_hours есть', "'free.ttl_hours'" in SRC)
check('по умолчанию 0 (никогда)', "('int', 0, 720, 0" in SRC)
check('авто-пауза уважает 0', "if _ttl_hours <= 0:" in SRC)
check('пауза сообщает disabled', "'disabled': True" in SRC)

# 2) пробный переехал в бесплатный
check('миграция trial → free', "SET plan='free' WHERE plan='trial'" in SRC)
check('_user_plan переводит trial в free', "if plan == 'trial':" in SRC and "plan = 'free'" in SRC)
check('бонус активирует free, не trial', "patch = {'plan': 'free', 'subscribed': 1}" in SRC)

# 3) тексты без «24 часа» и «пробного»
check('в приветствии нет «на 24 часа»',
      '1 поиск лота бесплатно на 24 часа' not in SRC)
check('в приветствии сказано про один поиск', 'один поиск лота' in SRC)
check('заголовок тарифа — «Бесплатный доступ»', 'Бесплатный доступ' in TPL)
check('собранная страница обновлена', 'Бесплатный доступ' in IDX)
check('payments.js без «Пробный период»',
      "'Пробный период'" not in PAY)
check('payments.js показывает «1 поиск»', "badge.textContent = '1 поиск'" in PAY)
check('adapter без «Пробный на 24 часа»', 'Пробный на 24 часа' not in ADP)
check('описание Плюса без суточного ограничения',
      'В бесплатном — один поиск без ограничения по времени' in TPL)

check('старые паузы по сроку можно снять', "action == 'unpause_ttl'" in SRC)
check('есть безопасная рассылка по группе', 'async def _notify_cohort(' in SRC)
check('рассылка пропускает заблокировавших', 'uid in blocked_ids' in SRC)
check('есть предпросмотр и защита от повтора', "'already_sent'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
