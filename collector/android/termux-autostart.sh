#!/data/data/com.termux/files/usr/bin/bash
# Самовосстанавливающийся запуск сборщика ПОЛКИ на телефоне.
# Запускается из Termux. Делает всё сам:
#   • проверяет Debian и Python внутри него
#   • восстанавливает файлы сборщика, если их нет
#   • пишет config.json с токеном, если его нет
#   • запускает сбор в фоне с автоперезапуском
#   • ставит автозапуск при включении телефона (Termux:Boot)
set -u

TOKEN="SqACgHa7rmIH9K9iu2zerxf2qlr9kdF6fqGHCQaeC4E="
SERVER="https://polka-mini-app-nikicev2009.mia0.amvera.tech"
REPO="https://raw.githubusercontent.com/gereev213-creator/polka/master/collector"
ROOTFS="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/debian"
DEST="$ROOTFS/root/polka-collector"

say() { printf "\n\033[1;34m%s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m%s\033[0m\n" "$1"; exit 1; }

say "1/5 проверяю Termux и Debian"
command -v proot-distro >/dev/null 2>&1 || pkg install -y proot-distro >/dev/null 2>&1 || \
  die "Не удалось поставить proot-distro"
[ -d "$ROOTFS" ] || proot-distro install debian || die "Debian не установился"

say "2/5 проверяю Python и curl_cffi внутри Debian"
proot-distro login debian -- bash -lc \
  "command -v python3 >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq python3 python3-pip); \
   python3 -c 'import curl_cffi' 2>/dev/null || pip3 install --break-system-packages -q curl_cffi" \
  || die "Зависимости внутри Debian не установились"

say "3/5 восстанавливаю файлы сборщика"
mkdir -p "$DEST/logs"
if [ ! -f "$DEST/collect.py" ]; then
  proot-distro login debian -- bash -lc "python3 - <<'PY'
import urllib.request
base = 'https://raw.githubusercontent.com/gereev213-creator/polka/master/collector'
for src, dst in [('collect.py','/root/polka-collector/collect.py')]:
    urllib.request.urlretrieve(base + '/' + src, dst)
print('collect.py скачан')
PY" || die "Не удалось скачать collect.py"
fi

say "4/5 проверяю config.json"
if [ ! -s "$DEST/config.json" ] || ! grep -q '"token"' "$DEST/config.json"; then
  cat > "$DEST/config.json" <<JSON
{
  "server": "$SERVER",
  "token": "$TOKEN",
  "max_targets": 1,
  "targets": []
}
JSON
  echo "config.json создан"
else
  echo "config.json на месте"
fi

# Раннер с автоперезапуском внутри Debian
cat > "$DEST/runner.sh" <<'RUN'
#!/bin/bash
cd /root/polka-collector || exit 1
mkdir -p logs
pkill -f "collect.py --loop" 2>/dev/null
sleep 2
while true; do
  python3 -u collect.py --loop --every 900 >> logs/collector.log 2>&1
  echo "=== $(date '+%d.%m %H:%M') перезапуск через 20 с ===" >> logs/collector.log
  sleep 20
done
RUN
chmod +x "$DEST/runner.sh"

say "5/5 запускаю сбор в фоне"
termux-wake-lock 2>/dev/null || true
# Гасим прежние запуски, чтобы не было дублей
pkill -f "polka-collector/runner.sh" 2>/dev/null || true
sleep 1
nohup proot-distro login debian -- /root/polka-collector/runner.sh > "$HOME/polka-runner.log" 2>&1 &
sleep 8

# Автозапуск при включении телефона
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/polka.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
sleep 25
cd "$HOME" || exit 1
nohup proot-distro login debian -- /root/polka-collector/runner.sh >> "$HOME/polka-runner.log" 2>&1 &
BOOT
chmod +x "$HOME/.termux/boot/polka.sh"

sleep 20
say "Проверка:"
proot-distro login debian -- tail -6 /root/polka-collector/logs/collector.log 2>/dev/null || \
  echo "лог пока пуст — первый проход идёт, смотрите: tail -f ~/polka-runner.log"

cat <<DONE

─────────────────────────────────────────
Сборщик запущен в фоне и будет перезапускаться сам.
Логи:   proot-distro login debian -- tail -f /root/polka-collector/logs/collector.log
Стоп:   proot-distro login debian -- pkill -f collect.py
Автозапуск при включении телефона: уже прописан
(нужно один раз открыть приложение Termux:Boot из F-Droid).
─────────────────────────────────────────
DONE
