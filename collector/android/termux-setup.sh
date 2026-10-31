#!/data/data/com.termux/files/usr/bin/bash
# УСТАНОВКА СБОРЩИКА НА ТЕЛЕФОН — ОДНА КОМАНДА.
# Запускать в Termux. Скрипт сам ставит Debian, Python, библиотеку,
# скачивает сборщик, настраивает автозапуск и запускает его.
set -u

REPO_RAW="https://raw.githubusercontent.com/gereev213-creator/polka/master/collector"
ROOTFS="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/debian"
DEST="$ROOTFS/root/polka-collector"

say() { printf "\n\033[1;34m%s\033[0m\n" "$1"; }
fail() { printf "\n\033[1;31m%s\033[0m\n" "$1"; exit 1; }

say "1/6  Базовые пакеты Termux"
pkg install -y proot-distro curl >/dev/null 2>&1 || true

if [ ! -d "$ROOTFS" ]; then
  say "2/6  Ставлю Debian (3–5 минут, нужен интернет)"
  proot-distro install debian || fail "Debian не установился. Проверьте интернет и повторите."
else
  say "2/6  Debian уже установлен"
fi

say "3/6  Ставлю Python и библиотеку внутри Debian (2–4 минуты)"
proot-distro login debian -- bash -lc \
  "apt-get update -qq && apt-get install -y -qq python3 python3-pip unzip ca-certificates && \
   pip3 install --break-system-packages -q curl_cffi" \
  || fail "Не удалось поставить зависимости внутри Debian."

say "4/6  Скачиваю сборщик"
mkdir -p "$DEST"
curl -sL "$REPO_RAW/collect.py"  -o "$DEST/collect.py"  || fail "Не скачался collect.py"
curl -sL "$REPO_RAW/android/runner.sh" -o "$DEST/runner.sh" || fail "Не скачался runner.sh"
curl -sL "$REPO_RAW/android/README.md" -o "$DEST/README.md" || true
chmod +x "$DEST/runner.sh"

say "5/6  Нужен токен приёма находок"
echo "Вставьте токен (INGEST_TOKEN из Amvera) и нажмите Enter."
printf "Токен: "
read -r TOKEN < /dev/tty
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
[ ${#TOKEN} -lt 20 ] && fail "Токен слишком короткий — скопируйте целиком."

cat > "$DEST/config.json" <<JSON
{
  "server": "https://polka-mini-app-nikicev2009.mia0.amvera.tech",
  "token": "$TOKEN",
  "max_targets": 2,
  "targets": []
}
JSON
echo "Токен записан (${#TOKEN} символов)."

say "6/6  Настраиваю автозапуск"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/polka-collector.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
for i in $(seq 1 30); do
  ping -c1 -W2 8.8.8.8 >/dev/null 2>&1 && break
  sleep 5
done
proot-distro login debian -- /root/polka-collector/runner.sh
BOOT
chmod +x "$HOME/.termux/boot/polka-collector.sh"
termux-wake-lock 2>/dev/null || true

say "Проверяю доступ к Авито…"
proot-distro login debian -- bash -lc "cd /root/polka-collector && python3 collect.py --check-proxy" || true

say "Запускаю сбор в фоне"
nohup proot-distro login debian -- /root/polka-collector/runner.sh > "$HOME/polka-runner.log" 2>&1 &
sleep 5

cat <<DONE

─────────────────────────────────────────
Готово. Что дальше:

1. Поставьте Termux:Boot из F-Droid и откройте его один раз —
   тогда сбор будет запускаться сам при включении телефона.

2. Логи:      proot-distro login debian -- tail -20 /root/polka-collector/logs/collector.log
3. Стоп:      proot-distro login debian -- pkill -f collect.py
4. Старт:     nohup proot-distro login debian -- /root/polka-collector/runner.sh > ~/polka-runner.log 2>&1 &

Сбор идёт раз в 15 минут, по 2 раздела за проход.
─────────────────────────────────────────
DONE
