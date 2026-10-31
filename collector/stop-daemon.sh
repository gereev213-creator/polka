#!/usr/bin/env bash
# Останавливает фоновый сборщик — вместе с дочерним collect.py.
#
# Раньше убивался только цикл run.sh, а python3 collect.py оставался жить:
# он продолжал ходить в Авито, писать в тот же лог и перезаписывать cookies.
# Так накопилось ТРИ одновременных сборщика, они выжгли IP (429 на всё),
# и находки перестали приходить. Теперь гасим всё дерево процессов.
set -u
cd "$(dirname "$0")" || exit 1
PID_FILE="logs/collector.pid"

stop_tree() {
  local pid="$1"
  # Сначала дети, потом родитель: иначе цикл успеет поднять нового ребёнка
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    stop_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    stop_tree "$PID"
    echo "Остановлен (PID $PID) вместе с дочерними процессами"
  else
    echo "Процесс уже не работает"
  fi
  rm -f "$PID_FILE"
else
  echo "PID-файл не найден — возможно, сборщик не запущен"
fi

# Подстраховка: осиротевшие сборщики от прошлых запусков (PID-файл уже не
# знает про них, но в Авито они ходят как обычные).
for stray in $(pgrep -f "collect.py --loop" 2>/dev/null); do
  kill "$stray" 2>/dev/null && echo "Остановлен осиротевший сборщик (PID $stray)"
done
