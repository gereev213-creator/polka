"""Фильтры «частник / состояние / АКБ» и тихий режим.

Проблема с живой базы: у 4266 из 4267 объявлений не было ни продавца, ни
состояния, ни описания — фильтры в критерии были, но проверить их было
нечем, и человек получал неподходящие лоты.

Запуск: python3 tests/test_quality_filters.py
"""
import ast
import datetime
import html
import os
import sys
from typing import Any, Dict, List

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = open(os.path.join(ROOT, 'polka_bot-9-3.py'), encoding='utf-8').read()
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


# 1) АКБ: чип в форме, разбор требования в критерий
check('чип «АКБ от 85%» в форме', 'АКБ от 85%' in TPL)
check('чип есть в собранной странице', 'АКБ от 85%' in IDX)
check('сервер разбирает АКБ в battery_min', "req_json['battery_min']" in SRC)
check('значение по умолчанию 85', '_bat = 85' in SRC)

# 2) состояние и АКБ проверяются на всех планах, а не только на платном
check('состояние без условия deep_check',
      "if rj.get('condition_min') and rj.get('condition_min') != 'any':" in SRC)
check('АКБ без условия deep_check', "if rj.get('battery_min'):" in SRC)
check('старая отговорка убрана', "if not deep_check and (rj.get('condition_min')" not in SRC)

# 3) проход за описаниями/продавцом
check('есть проход за описаниями', 'async def _collector_details_pass(' in SRC)
check('вызывается в цикле сбора', '_collector_details_pass(collector, cfg' in SRC)
check('ограничен таймаутом', 'timeout=150' in SRC)
check('не блокирует сбор (после run_once)', SRC.find('await asyncio.wait_for(\n                    _collector_details_pass') > SRC.find('collector.run_once'))
check('описания уходят в /api/ingest/details', 'collector.push_details' in SRC)
check('неудачи помечаются failed', '_details_failed_ids' in SRC)
check('не больше 3 карточек за проход', 'limit=3' in SRC)

# 4) тихий режим
check('есть настройка auto_sends.paused', "'auto_sends.paused'" in SRC)
check('по умолчанию автосообщения включены', "('str', None, None, '0'" in SRC)
check('есть хелпер', 'def _auto_sends_paused(' in SRC)
check('дожим уважает тишину', 'дожим: тихий режим' in SRC)
check('продление уважает тишину', 'продление: тихий режим' in SRC)
check('уведомления о паузе уважают тишину',
      SRC.count('if not _auto_sends_paused():') >= 2)
check('есть действие auto_sends', "action == 'auto_sends'" in SRC)
check('есть правка настроек по токену', "action == 'set_setting'" in SRC)
check('hunt.require_desc есть в схеме', "'hunt.require_desc': ('str'" in SRC)
check('тесты только на админов', "'test_only_admin'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
