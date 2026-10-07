#!/usr/bin/env bash
# Запуск сборщика находок НА ВАШЕМ КОМПЬЮТЕРЕ.
#
# Зачем: Авито блокирует адреса дата-центров, поэтому с сервера Amvera сбор
# невозможен (проверено: ответ 429 «проблема с IP»). Ваш домашний интернет
# для Авито выглядит как обычный абонент, и сбор работает.
#
# Что делает скрипт:
#   1. спрашивает токен из Amvera (один раз);
#   2. проверяет, пускает ли Авито с вашего IP;
#   3. если пускает — запускает сбор каждые 5 минут.
set -u
cd "$(dirname "$0")" || exit 1

SERVER="${POLKA_SERVER:-https://polka-mini-app-nikicev2009.mia0.amvera.tech}"
TOKEN="${POLKA_INGEST_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "Нужен токен, который вы задали в Amvera как INGEST_TOKEN."
  printf "Вставьте его и нажмите Enter: "
  read -r TOKEN
fi
if [ -z "$TOKEN" ]; then
  echo "Токен не введён — выходим."
  exit 1
fi

PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python

# curl_cffi решает главную проблему: Авито блокирует обычный Python по
# отпечатку клиента. Без него сбор не пойдёт, поэтому ставим сразу.
if ! "$PY" -c "import curl_cffi" >/dev/null 2>&1; then
  echo "Ставлю библиотеку curl_cffi — без неё Авито не пускает (это разово)…"
  "$PY" -m pip install --quiet --user curl_cffi || "$PY" -m pip install --quiet curl_cffi
  if ! "$PY" -c "import curl_cffi" >/dev/null 2>&1; then
    echo "Не удалось поставить curl_cffi. Выполните вручную:"
    echo "    $PY -m pip install curl_cffi"
    exit 1
  fi
  echo "Готово."
fi

echo
echo "Шаг 1 из 2. Проверяем, пускает ли Авито с вашего IP…"
if ! "$PY" collect.py --check-proxy; then
  echo
  echo "Авито не пустил — причина написана выше."
  echo "Если это блокировка по IP, нужен резидентный прокси."
  exit 1
fi

echo
echo "Шаг 2 из 2. Авито доступен. Запускаю сбор каждые 5 минут."
echo "Окно должно оставаться открытым. Остановить — Ctrl+C."
echo
POLKA_SERVER="$SERVER" POLKA_INGEST_TOKEN="$TOKEN" \
  exec "$PY" collect.py --loop --every 300
