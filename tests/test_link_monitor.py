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
TPL = open(os.path.join(ROOT, 'polka-final/frontend/proto/template.html'),
            encoding='utf-8').read()
PAY = open(os.path.join(ROOT, 'polka-final/frontend/proto/payments.js'),
           encoding='utf-8').read()
BAT = open(os.path.join(ROOT, 'collector/start-windows.bat'), encoding='utf-8').read()
ADP = open(os.path.join(ROOT, 'polka-final/frontend/proto/adapter.js'),
           encoding='utf-8').read()
# Скрытие продавца: кнопка в находке, фильтр отправки, таблица блокировок
check('в находке есть кнопка «не показывать продавца»',
      'Не показывать продавца' in SRC and 'callback_data=f"blk:' in SRC)
check('скрытый продавец не приходит в чат',
      '_seller_blocked_for' in SRC and "hunt_release([row], 'rejected', 'seller_blocked')" in SRC)
check('таблица заблокированных продавцов', 'CREATE TABLE IF NOT EXISTS blocked_sellers' in SRC)
check('сборщик приносит ID продавца',
      "'seller_id': seller_id" in COL and 'sellerId' in COL)
# Скорость: платная проверка — раз в минуту
check('платная проверка раз в минуту',
      "'link.check_paid_min': ('int', 1, 1440, 1" in SRC)
check('в интерфейсе «каждую минуту»',
      'каждую минуту' in TPL and 'каждую минуту' in PAY)
check('сборщик ходит по кругу каждую минуту', '--every 60' in BAT)
check('ускоренный режим на N часов',
      'link.fast_until:' in SRC and "action == 'grant_fast_hours'" in SRC)
# Если ID продавца неизвестен — заявка сборщику, потом автоскрытие
check('заявка на уточнение продавца', 'seller_block_requests' in SRC
      and 'Уточняю продавца' in SRC)
check('эндпоинт заявок для сборщика', "'/api/ingest/block-requests'" in SRC
      and 'fetch_block_requests' in COL)
check('сборщик приносит ID со страницы объявления',
      "'seller_id': seller.get('seller_id', '')" in COL
      and 'seller_id' in COL)
check('после уточнения продавец скрывается с подтверждением',
      'Продавец скрыт' in SRC and '_block_ready' in SRC)
check('находка приходит с фото (и списком, и JSON строкой)',
      'def _ad_photo_url(' in SRC and 'isinstance(raw, list)' in SRC
      and 'io.BytesIO(data)' in SRC)
check('кнопка приложения ведёт на карточку товара',
      '/?ad={ad' in SRC and 'jumpToAd' in ADP)
check('карточка по ?ad= открывается', 'window.PolkaProduct(id)' in ADP)
check('карточка догружается с сервера по id',
      "window.PolkaAPI.api('/api/ads/' + encodeURIComponent(id))" in ADP)
check('в находке город берётся из адреса объявления',
      "ad['city'] = _city_from_ad" in SRC)
# Резюме и вакансии: у них нет цены, но они тоже находки
check('резюме/вакансии поддерживаются без цены',
      'def _crit_is_resume(' in SRC and 'Резюме · цена не указана' in SRC
      and 'if price <= 0 and not crit_ids:' in SRC)
check('сборщик разбирает ссылки резюме без подчёркивания',
      '\\d{7,}' in COL and 'Резюме и часть объявлений' in COL)
check('сборщик пропускает карточки без цены в разбор',
      'if link and title:' in COL and "'price': parse_price(price.group(1)) if price else 0" in COL)
check('находки из чужого региона отбрасываются',
      'def _crit_region(' in SRC and "return no('other_region')" in SRC)
check('регион виден в тексте находки',
      "'izhevsk': 'Ижевск'" in SRC)
check('цена из пути ссылки (do-10tr)',
      "do-(\\d{1,6})(?:tr|k)?" in SRC)
check('сборщик уважает интервал проверки ссылки',
      'check_interval_min' in COL and "ссылок на паузе по тарифу" in COL)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
