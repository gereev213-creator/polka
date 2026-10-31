#!/usr/bin/env bash
# Постоянный сбор ВНУТРИ Debian: сам перезапускается при падении.
# Запускается автоматически из Termux (см. android/termux-boot.sh).
set -u
cd /root/polka-collector 2>/dev/null || exit 1
mkdir -p logs

# Один экземпляр: гасим старые, чтобы не было дублей
pkill -f "collect.py" 2>/dev/null
sleep 2

rotate_log() {
  if [ -f logs/collector.log ] && [ "$(wc -c < logs/collector.log)" -gt 5000000 ]; then
    mv logs/collector.log logs/collector.log.1
  fi
}

while true; do
  rotate_log
  echo "=== $(date '+%Y-%m-%d %H:%M') запуск сборщика ===" >> logs/collector.log
  python3 -u collect.py --loop --every 900 >> logs/collector.log 2>&1
  echo "=== $(date '+%Y-%m-%d %H:%M') сборщик завершился, перезапуск через 30 с ===" >> logs/collector.log
  sleep 30
done
