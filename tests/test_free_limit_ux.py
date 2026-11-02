"""Бесплатный лимит: не тупик, а замена поиска.

Живой случай: человек с пробным не знал о нём, создал второй поиск —
получил «оформите подписку» и ушёл с мыслью, что бесплатного нет.
Теперь: пояснение в форме + предложение заменить текущий поиск без оплаты.

Запуск: python3 tests/test_free_limit_ux.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
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


check('есть запрос активных поисков', 'async function activeSearches()' in ADP)
check('на лимите предлагает заменить', 'Заменить его новым' in ADP)
check('удаляет старый перед повторной попыткой', "'/api/hunt?id='" in ADP)
check('повторная попытка создания', 'createSearch(payload, true)' in ADP)
check('без второго цикла (флаг _retried)', '!_retried' in ADP)
check('понятный текст без тупика', 'Можно заменить его новым' in ADP)
check('подсказка в форме', 'На бесплатном — 1 активный поиск' in TPL)
check('подсказка в собранной странице', 'На бесплатном — 1 активный поиск' in IDX)
check('диалог через Telegram, а не браузерный confirm',
      'TG.showConfirm' in ADP)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
