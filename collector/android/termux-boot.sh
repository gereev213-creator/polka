#!/data/data/com.termux/files/usr/bin/bash
# Запускается Termux:Boot при включении телефона.
# Держит телефон активным и поднимает сборщик внутри Debian.
termux-wake-lock 2>/dev/null || true
# Ждём сеть
for i in $(seq 1 30); do
  ping -c1 -W2 8.8.8.8 >/dev/null 2>&1 && break
  sleep 5
done
proot-distro login debian -- /root/polka-collector/android-runner.sh
