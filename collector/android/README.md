# Сборщик на старом Android-телефоне

Телефон с домашним Wi-Fi даёт «живой» IP: Авито не блокирует его так,
как серверы. Ниже — установка с нуля, 20–30 минут.

## 1. Termux

Ставим **с F-Droid**, не из Play Market (там версия устарела):
https://f-droid.org/packages/com.termux/

## 2. Debian внутри Termux

Почему так: библиотека `curl_cffi` (без неё Авито отдаёт 439) собрана под
Linux. В самом Termux (Android) она не ставится, а в Debian внутри
Termux — ставится готовым пакетом.

```bash
pkg update -y && pkg install -y proot-distro
proot-distro install debian
proot-distro login debian
```

## 3. Внутри Debian

```bash
apt update && apt install -y python3 python3-pip git curl
pip3 install --break-system-packages curl_cffi
```

## 4. Код сборщика

```bash
cd /root
git clone https://github.com/gereev213-creator/polka-project.git
cd polka-project/collector
cp config.example.json config.json
nano config.json      # вставить token (см. ниже)
```

Токен `INGEST_TOKEN` — та же строка, что задана в Amvera. Вставить в
поле `"token"` файла `config.json`.

## 5. Запуск

```bash
python3 collect.py --check-proxy     # проверка: пускает ли Авито
python3 collect.py --loop --every 1200
```

## 6. Чтобы телефон не засыпал

- В Termux: `termux-wake-lock`
- В настройках Android: отключить оптимизацию батареи для Termux
- Держать телефон на зарядке

## Остановка

Ctrl+C в Termux, либо закрыть сессию proot.
