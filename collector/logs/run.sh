#!/usr/bin/env bash
cd "/Users/nikitagereev/PyCharmMiscProject/amvera-upload/collector" || exit 1
while true; do
  POLKA_REQUEST_GAP="90"   POLKA_REQUEST_GAP_MAX="240"   "python3" -u collect.py --loop --every "1200" >> "logs/collector.log" 2>&1
  echo "=== 2026-10-31 18:44 сборщик завершился, перезапуск через 20 с ===" >> "logs/collector.log"
  sleep 20
done
