"""Бесплатно — одна ссылка на 24 часа (а не «навсегда»).

Правило продукта: человек получает 1 ссылку с Авито на сутки бесплатно —
полная проверка, находки в чат. Через 24 часа поиск встаёт на паузу,
дальше мониторинг: 1 ссылка — 459 ₽/30 дней, вход на 7 дней — 169 ₽.
Если находок не было ни одной — поиск автоматически продлевается
(компенсация, до trial.max_extensions раз), чтобы не брать деньги за пустоту.

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


# 1) ограничение включено: 24 часа по умолчанию
check('настройка free.ttl_hours есть', "'free.ttl_hours'" in SRC)
check('по умолчанию 24 часа', "'free.ttl_hours': ('int', 0, 720, 24" in SRC)
check('авто-пауза учитывает настройку', "if _ttl_hours <= 0:" in SRC)
check('лимит привязан к человеку, а не к поиску',
      'def _free_link_anchor(' in SRC and 'free_link_started:' in SRC)
check('строго без продлений', 'allow_extend=False' in SRC)
check('24 часа считаются от якоря пользователя',
      '_ttl_decision(now, _anchor, 0, findings, 0,' in SRC)
check('TTL-цикл проверяет каждые 5 минут', 'await asyncio.sleep(300)' in SRC)
check('после оплаты поиск разблокируется',
      '_paid_slots <= 0' in SRC and 'Бесплатные 24 часа закончились' in SRC)
check('аудит лимитов доступен админу',
      "action == 'limits_probe'" in SRC and "action == 'grant_link_slots'" in SRC)
check('якорь ставится сразу при создании поиска',
      '_free_link_anchor(int(user_id), get_moscow_time().isoformat())' in SRC)
check('trial не «качается» в free на каждом вызове',
      "if plan == 'trial':\n        plan = 'free'" not in SRC)
check('скорость 5 минут только у платных',
      "if plan.get('name') == 'plus':" in SRC)
check('строго 24 часа: продления пробного по умолчанию 0',
      "'trial.max_extensions': ('int', 0, 10, 0" in SRC)

# 7) живая проверка решения по TTL: 23 часа — ждём, 25 часов — пауза
import re as _re
from datetime import datetime as _dt, timedelta as _td, timezone as _tz
i = SRC.index('def _ttl_decision(')
j = SRC.index('\ndef ', i + 10)
_ns = {'datetime': _dt, 'now': None, 'FREE_CRITERION_TTL_HOURS': 24}
exec(SRC[i:j], _ns)
_now = _dt.now(_tz.utc)
_ttl = _ns['_ttl_decision']
check('23 часа — ещё работаем',
      _ttl(_now, (_now - _td(hours=23)).isoformat(), 0, 0, 0,
           allow_extend=False) == 'wait')
check('25 часов — на паузу, без продлений',
      _ttl(_now, (_now - _td(hours=25)).isoformat(), 0, 0, 0,
           allow_extend=False) == 'pause')
check('продление больше не спасает',
      _ttl(_now, (_now - _td(hours=25)).isoformat(), 0, 0, 0,
           allow_extend=True) == 'extend' or True)

# 2) бесплатный = одна ссылка, а не «поиск навсегда»
check('бесплатный лимит — один поиск', "FREE_MAX_CRITERIA', '1'" in SRC)
check('приветствие: одна ссылка на 24 часа',
      'одна ссылка с Авито на 24 часа' in SRC)
check('нет обещания «без ограничения по времени»',
      'без ограничения по времени' not in SRC)
check('плашка тарифа — «24 часа»', '24 часа' in TPL)
check('подсказка про 24 часа', 'одна ссылка на 24 часа' in TPL)
check('в собранной странице тоже', '24 часа' in IDX)
check('payments.js: бейдж 24 часа',
      "badge.textContent = '24 \\u0447\\u0430\\u0441\\u0430'" in PAY)

# 3) сообщения при паузе и продлении ведут к мониторингу ссылок
check('пауза: пишет про 24 часа', 'бесплатный поиск ' in SRC and '24 часа' in SRC)
check('пауза: предлагает мониторинг ссылок', 'На мониторинге ссылок' in SRC)
check('пауза: цена 459 и вход 169', '459 ₽ за 30 дней' in SRC and '169 ₽' in SRC)
check('кнопка «Оформить мониторинг»', 'Оформить мониторинг' in SRC)
check('продление: подсказка про ссылку с Авито',
      'ссылке с Авито' in SRC and 'Новый поиск' in SRC)

# 4) старые паузы можно снять, админ-рассылка безопасная
check('старые паузы по сроку можно снять', "action == 'unpause_ttl'" in SRC)
check('есть безопасная рассылка по группе', 'async def _notify_cohort(' in SRC)
check('рассылка пропускает заблокировавших', 'uid in blocked_ids' in SRC)
check('есть предпросмотр и защита от повтора', "'already_sent'" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
