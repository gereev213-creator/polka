#!/usr/bin/env bash
# Установка автозапуска. Запускать В TERMUX (не внутри Debian), один раз.
set -u
cd "$(dirname "$0")" 2>/dev/null || true

DEBIAN_ROOT=/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/debian
if [ ! -d "$DEBIAN_ROOT" ]; then
  echo "Не найден Debian. Сначала: proot-distro install debian"
  exit 1
fi

# 1. Скрипт-раннер внутрь Debian
mkdir -p "$DEBIAN_ROOT/root/polka-collector"
cp android-runner.sh "$DEBIAN_ROOT/root/polka-collector/android-runner.sh" 2>/dev/null || \
  cp "$(dirname "$0")/runner.sh" "$DEBIAN_ROOT/root/polka-collector/android-runner.sh"
chmod +x "$DEBIAN_ROOT/root/polka-collector/android-runner.sh"

# 2. Автозапуск при включении телефона
mkdir -p ~/.termux/boot
cp "$(dirname "$0")/termux-boot.sh" ~/.termux/boot/polka-collector.sh
chmod +x ~/.termux/boot/polka-collector.sh

echo "Готово."
echo "1) Поставьте приложение Termux:Boot из F-Droid и откройте его один раз."
echo "2) Перезагрузите телефон — сборщик поднимется сам."
echo "3) Сейчас можно запустить без перезагрузки:"
echo "     termux-wake-lock && proot-distro login debian -- /root/polka-collector/android-runner.sh"
