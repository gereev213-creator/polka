"""Пауза и удаление поиска: сборщик не должен по нему ходить.

Проверяем то, что человек ожидает по кнопкам:
- «пауза» → критерий не попадает сборщику (сервер отдаёт только active=1);
- «удалить» → критерия нет, сборщик по нему не идёт, а решения удаляются;
- если активных критериев не осталось вовсе — сбор не идёт (раньше
  сборщик откатывался на встроенный список категорий и качал Авито впустую).

Запуск: python3 tests/test_criteria_lifecycle.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'polka_bot-9-3.py'), encoding='utf-8').read()
COL = open(os.path.join(HERE, '..', 'collector', 'collect.py'), encoding='utf-8').read()
UI = open(os.path.join(HERE, '..', 'polka-final/frontend/src/App.jsx'), encoding='utf-8').read()

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


# 1) сборщику уходят только активные критерии
i = SRC.index("if method == 'GET' and request.query.get('for_collector')")
j = SRC.index('return _miniapp_json', i)
for_collector = SRC[i:j]
check('сборщику отдаются только active=1', 'WHERE active=1' in for_collector)

# 2) пауза ставит active=0
check('пауза выключает критерий', 'UPDATE hunt_criteria SET active=?' in SRC)

# 3) удаление удаляет строку критерия и его решения
i = SRC.index('def remove_criterion(')
j = SRC.index('\ndef ', i + 10)
body = SRC[i:j]
check('удаление критерия', 'DELETE FROM hunt_criteria' in body)
check('удаление решений критерия', 'DELETE FROM hunt_matches WHERE crit_id=?' in body)
check('чужой критерий не удаляется', 'AND user_id=?' in body)

# 4) без активных критериев сборщик не ходит на Авито
check('сборщик пропускает проход без критериев',
      'Активных критериев нет — искать нечего' in COL)
check('встроенный список только по флагу',
      "POLKA_USE_STATIC_TARGETS" in COL)

# 5) админка показывает статистику поисков
check('метрики отдают список поисков', "out['criteria_list']" in SRC)
check('метрики считают людей с поиском', "criteria_users" in SRC)
check('в админке есть блок поисков', 'Поиски пользователей' in UI)
check('в админке видно находки/отправлено', "c.finds || 0}/{c.sent || 0}" in UI)
check('сервер отдаёт требования поиска', "'requirements': crit.get('requirements')" in SRC)
ADP = open(os.path.join(HERE, '..', 'polka-final/frontend/proto/adapter.js'), encoding='utf-8').read()
check('карточка показывает минус-слова', 'минус: ${String(c.exclude)' in ADP)
check('карточка показывает состояние', 'состояние: ${rj.condition_min}' in ADP)

# 6) бесплатный доступ: 1 поиск, сутки, потом пауза и только Плюс
check('бесплатный лимит — один поиск', "FREE_MAX_CRITERIA', '1'" in SRC)
check('сутки бесплатного поиска', "FREE_CRITERION_TTL_HOURS" in SRC)
check('авто-пауза по сроку есть', 'def pause_expired_free_criteria(' in SRC)
check('джоб паузы в расписании', 'pause_expired_free_criteria_job' in SRC)
check('снятие паузы проверяет лимит', "reason == 'ttl'" in SRC)
check('снятие паузы проверяет активные', 'один активный поиск' in SRC)
check('клиент показывает «Оформите Плюс»', 'Оформите «Плюс»' in ADP)
check('клиент ведёт в тарифы', "go('tariffs')" in ADP)
check('карточка показывает причину паузы', 'нужен Плюс' in ADP)

# 7) цифры в интерфейсе не расходятся с правилами
TPL = open(os.path.join(HERE, '..', 'polka-final/frontend/proto/template.html'),
           encoding='utf-8').read()
check('в клиенте нет «2 поиска»', "'2 поиска'" not in ADP)
check('бесплатный лимит берётся у сервера', 'data.criteria_limit' in ADP)
check('в описании Плюса — 1 поиск в бесплатном', 'В бесплатном и пробном — 1 поиск на 24 часа' in TPL)
check('нет обещания проверки каждые 5 минут', 'Проверка каждые 5 минут' not in TPL)
check('честный интервал проверки', 'Проверка каждые 20 минут' in TPL)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
