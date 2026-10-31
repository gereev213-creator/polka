#!/usr/bin/env bash
# Останавливает фоновый сборщик.
set -u
cd "$(dirname "$0")" || exit 1
PID_FILE="logs/collector.pid"
if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" && echo "Остановлен (PID $PID)"
  else
    echo "Процесс уже не работает"
  fi
  rm -f "$PID_FILE"
else
  echo "PID-файл не найден — возможно, сборщик не запущен"
fi
