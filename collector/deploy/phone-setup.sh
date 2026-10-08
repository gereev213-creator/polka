#!/data/data/com.termux/files/usr/bin/bash
# Установка сборщика на старый Android-телефон (Termux).
# Запускать В TEPMUX на телефоне:  bash phone-setup.sh
set -e

echo "1/6  Обновляю пакеты…"
pkg update -y >/dev/null 2>&1 || true
pkg install -y python git >/dev/null 2>&1 || pkg install -y python

echo "2/6  Ставлю библиотеку против защиты Авито…"
pip install --quiet curl_cffi certifi

echo "3/6  Разрешаю доступ к памяти телефона…"
termux-setup-storage 2>/dev/null || true

echo "4/6  Готовлю папку…"
mkdir -p ~/polka
if [ ! -f ~/polka/collect.py ]; then
  if [ -f ~/storage/downloads/collect.py ]; then
    cp ~/storage/downloads/collect.py ~/polka/
    echo "     collect.py взят из «Загрузок»"
  else
    echo "     ВНИМАНИЕ: collect.py не найден."
    echo "     Отправьте себе файл collect.py в Telegram, скачайте на телефон"
    echo "     и запустите этот установщик снова."
  fi
fi
if [ ! -f ~/polka/config.json ] && [ -f ~/storage/downloads/config.json ]; then
  cp ~/storage/downloads/config.json ~/polka/
  echo "     config.json взят из «Загрузок»"
fi

echo "5/6  Разрешаю работу без сна…"
termux-wake-lock 2>/dev/null || true

echo "6/6  Настраиваю автозапуск после перезагрузки…"
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/polka.sh <<'BOOT'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
cd ~/polka && nohup python collect.py --loop --every 900 >> ~/polka.log 2>&1 &
BOOT
chmod +x ~/.termux/boot/polka.sh

echo
echo "Готово. Проверка:"
cd ~/polka && python collect.py --check-proxy 2>&1 | tail -8
echo
echo "Если выше «✅ Работает» — запускаю сбор:"
cd ~/polka && nohup python collect.py --loop --every 900 >> ~/polka.log 2>&1 &
sleep 3
echo "Работает в фоне. Смотреть: tail -f ~/polka.log"
