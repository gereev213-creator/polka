"""Мониторинг ссылки: открыть, увидеть новое, отправить.

Проверяем, что сборщик умеет открыть ссылку поиска и посчитать, сколько
карточек новые — это ядро модели Avito Hunter.

Запуск: python3 tests/test_link_monitor.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
COL = open(os.path.join(ROOT, 'collector/collect.py'), encoding='utf-8').read()

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


check('есть проверка ссылки', "action == 'link_test'" in SRC)
check('сборщик открывает ссылку человека как есть', '_browser_link_url' in COL
      and 'return _browser_link_url(crit)' in COL)
check('ссылка не обрезается до раздела в браузере',
      'if AVITO_PROFILE:' in COL and '_browser_link_url(crit)' in COL)
check('первый проход — снимок выдачи без отправки',
      'первый проход по ссылке: запомнил' in COL)
check('сборщик помнит уже виденные лоты', 'LINK_SEEN_KEEP' in COL
      and "'seen_ids'" in COL)
check('в партию уходит список критериев ссылки', "payload['crit_ids'] = crit_ids" in COL)
check('страница ссылки — только первая, без наших pmin/pmax',
      "if target.get('link'):\n        return [url]" in COL)
check('без q= сборщик ссылку не подменяет на раздел',
      "and not target.get('link')" in COL)
check('ссылочные поиски в приоритете', "_prio = 5" in SRC)
check('сервер примеряет партию только к её критериям',
      "hunt_matches_recompute(ad_ids=_all, crit_id=int(_cid))" in SRC)
check('чужие объявления к ссылке не примеряются',
      "crits = [c for c in crits if not int(c.get('from_link') or 0)]" in SRC)
check('ссылка сама себе фильтр', "return Decision(True, 'ok', 'по ссылке')" in SRC)
check('новая ссылка не матчится со старой базой',
      'ссылочный — находки придёт сборщик' in SRC)
check('в проходе все ссылки, словесные — порцией',
      "word_targets_per_pass" in COL and "_link_t = []" in COL
      and "_word_t = [t for t in targets" in COL)
check('дорогая проверка «продано» отключается настройкой',
      "cfg.get('check_listings')" in COL)
check('скорость ссылки по тарифу: 30 минут бесплатно / 5 платно',
      'link.check_free_min' in SRC and 'link.check_paid_min' in SRC)
check('сборщик игнорирует словесные цели (только ссылки)',
      'POLKA_LINK_ONLY' in COL
      and "_links_only = [t for t in targets if t.get('link')]" in COL)
check('сборщик чистит состояние удалённых поисков',
      'Состояние: убрал' in COL and '_stale' in COL)
check('сборщик уважает интервал проверки ссылки',
      'check_interval_min' in COL and "ссылок на паузе по тарифу" in COL)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
