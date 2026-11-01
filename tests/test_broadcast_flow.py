"""Админская рассылка: сообщение не должно уходить в чужие режимы.

Реальная поломка: владелец нажал «Рассылка», отправил текст поста, а бот
ответил «Введите число — ID объявления» — сообщение перехватил зависший
режим удаления объявления или перевыгрузки в MAX.

Запуск: python3 tests/test_broadcast_flow.py
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


# 1) вход в рассылку чистит конкурирующие «ждущие ввод» флаги
i = SRC.index('async def admin_broadcast_start(')
j = SRC.index('\n# ', i)
start_body = SRC[i:j]
check('рассылка чистит удаление объявления', "'del_ad_step'" in start_body)
check('рассылка чистит перевыгрузку', "'republish_step'" in start_body)

# 2) в диспетчере текста рассылка проверяется раньше чужих режимов
d_i = SRC.index('async def dispatch_text(')
d_j = SRC.index('application.add_handler(MessageHandler(filters.PHOTO', d_i)
dispatch = SRC[d_i:d_j]
pos_broadcast = dispatch.find("ud.get('broadcast_data') is not None")
pos_republish = dispatch.find("ud.get('republish_step')")
pos_del = dispatch.find("ud.get('del_ad_step') == 'id_input'")
check('рассылка в диспетчере текста найдена', pos_broadcast > 0)
check('рассылка раньше перевыгрузки',
      pos_broadcast > 0 and pos_republish > 0 and pos_broadcast < pos_republish)
check('рассылка раньше удаления объявления',
      pos_broadcast > 0 and pos_del > 0 and pos_broadcast < pos_del)

# 3) в диспетчере фото рассылка тоже первая
p_i = SRC.index('async def dispatch_photo(')
p_j = SRC.index('async def dispatch_text(', p_i)
photo = SRC[p_i:p_j]
check('фото для рассылки не уходят в чужие режимы',
      photo.find("ud.get('broadcast_data') is not None") < photo.find("ud.get('republish_step')"))

# 4) блокировки бота учитываются
check('есть распознавание блокировки', 'def _is_blocked_error(' in SRC)
check('есть общая пометка блокировки', 'def _mark_bot_blocked(' in SRC)
check('рассылка пропускает заблокировавших', '_blocked_user_ids()' in SRC)
check('отчёт считает заблокировавших', 'blocked_count' in SRC)
check('статистика: доступны и заблокировали',
      "out['users_reachable']" in SRC and "out['users_blocked']" in SRC)
UI = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..',
                       'polka-final/frontend/src/App.jsx'), encoding='utf-8').read()
check('в админке KPI «Доступны»', "'Доступны'" in UI)
check('в админке KPI «Заблокировали бота»', "'Заблокировали бота'" in UI)
check('в админке блок последней рассылки', 'Последняя рассылка' in UI)

# 4b) отправка и отчёт на месте
check('есть цикл отправки', 'for user in users:' in SRC)
check('есть отчёт по рассылке', 'Рассылка завершена' in SRC)
check('данные рассылки очищаются', "del context.user_data['broadcast_data']" in SRC)

print()
if fail:
    print(f'ИТОГ: ПРОВАЛЕНО {fail}, прошло {ok}')
    sys.exit(1)
print(f'ИТОГ: ВСЕ {ok} ПРОВЕРОК ПРОЙДЕНЫ')
