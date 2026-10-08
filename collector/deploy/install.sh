#!/usr/bin/env bash
# Установка сборщика на отдельный сервер (VPS с Ubuntu/Debian).
# Запускать на СЕРВЕРЕ, а не на Mac:  bash install.sh
set -e
echo "1/4  Ставлю зависимости…"
apt-get update -qq && apt-get install -y -qq python3 python3-pip ca-certificates git >/dev/null
echo "2/4  Ставлю библиотеку для обхода защиты Авито…"
pip3 install --quiet --break-system-packages curl_cffi certifi 2>/dev/null || pip3 install --quiet curl_cffi certifi
echo "3/4  Кладу службу…"
mkdir -p /opt/polka-collector
cp -r "$(dirname "$0")/.."/* /opt/polka-collector/ 2>/dev/null || true
cp "$(dirname "$0")/polka-collector.service" /etc/systemd/system/
if [ ! -f /opt/polka-collector/config.json ]; then
  echo "    ВНИМАНИЕ: нет config.json с токеном."
  echo "    Скопируйте его из папки collector на Mac в /opt/polka-collector/"
fi
echo "4/4  Включаю автозапуск…"
systemctl daemon-reload
systemctl enable polka-collector
systemctl restart polka-collector
sleep 5
systemctl --no-pager status polka-collector | head -12
echo
echo "Готово. Смотреть работу:  journalctl -u polka-collector -f"
