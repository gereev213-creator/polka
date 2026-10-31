#!/usr/bin/env bash
# Постоянный сборщик на компьютере: работает, пока включён Mac.
#
# Отличие от start-local.sh: этот скрипт отцепляется от терминала
# (nohup + setsid), поэтому продолжает работать после закрытия окна.
# Логи и PID лежат рядом, в папке logs.
set -u
cd "$(dirname "$0")" || exit 1

PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python

mkdir -p logs
PID_FILE="logs/collector.pid"
LOG_FILE="logs/collector.log"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Сборщик уже работает (PID $(cat "$PID_FILE")). Лог: $LOG_FILE"
  exit 0
fi

if ! "$PY" -c "import curl_cffi" >/dev/null 2>&1; then
  echo "Ставлю curl_cffi (без него Авито не пускает)…"
  "$PY" -m pip install --quiet --user curl_cffi || "$PY" -m pip install --quiet curl_cffi
fi

# Запуск в отдельной сессии: процесс не умрёт вместе с терминалом
# В macOS нет setsid — отцепляем через nohup и disown: процесс получает
# собственный PID и не зависит от терминала.
POLKA_REQUEST_GAP="${POLKA_REQUEST_GAP:-90}" \
POLKA_REQUEST_GAP_MAX="${POLKA_REQUEST_GAP_MAX:-240}" \
nohup "$PY" -u collect.py --loop --every "${POLKA_EVERY:-1200}" \
  >> "$LOG_FILE" 2>&1 &
disown 2>/dev/null || true

echo $! > "$PID_FILE"
sleep 3
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Сборщик запущен в фоне (PID $(cat "$PID_FILE"))."
  echo "Лог: $(pwd)/$LOG_FILE"
  echo "Остановить: bash stop-daemon.sh"
else
  echo "Не запустился — смотрите $LOG_FILE"
  exit 1
fi
