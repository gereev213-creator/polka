#!/usr/bin/env bash
# Запуск сборщика на Android (внутри Debian через proot-distro).
# Использование: bash android/start.sh
set -u
cd "$(dirname "$0")/.." || exit 1

PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python

if ! "$PY" -c "import curl_cffi" >/dev/null 2>&1; then
  echo "Ставлю curl_cffi — без него Авито отвечает 439…"
  "$PY" -m pip install --break-system-packages --quiet curl_cffi \
    || "$PY" -m pip install --quiet curl_cffi
fi

if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "Создан config.json — впишите token (INGEST_TOKEN из Amvera) и запустите снова."
  exit 1
fi

mkdir -p logs
echo "Проверяю доступ к Авито…"
"$PY" collect.py --check-proxy || {
  echo "Авито не пускает. Смените IP (перезагрузка роутера) и попробуйте снова."
  exit 1
}

echo "Запускаю сбор каждые 20 минут. Лог: logs/collector.log"
nohup "$PY" -u collect.py --loop --every 1200 >> logs/collector.log 2>&1 &
echo $! > logs/collector.pid
echo "Готово, PID $(cat logs/collector.pid). Остановить: kill $(cat logs/collector.pid)"
