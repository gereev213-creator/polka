@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Адрес сервера Полки
set POLKA_SERVER=https://polka-mini-app-nikicev2009.mia0.amvera.tech

REM Токен воркера — такой же, как LIVE_WORKER_TOKEN в Amvera
set LIVE_WORKER_TOKEN=ВСТАВЬТЕ_ТОКЕН

REM Два канала: домашний и через прокси. Профили — копии старого профиля.
set WORKER_PROFILE_HOME=%~dp0profile-home
set WORKER_PROFILE_PROXY=%~dp0profile-proxy

REM Прокси (SOCKS5 с логином/паролем). Нет прокси — оставьте пустым.
set WORKER_PROXY=socks5h://ЛОГИН:ПАРОЛЬ@bproxy.site:11542

REM Смена IP прокси при старте (ссылка из панели провайдера, необязательно)
set WORKER_ROTATE_URL=https://changeip.mobileproxy.space/?proxy_key=ВСТАВЬТЕ_КЛЮЧ&format=json

set WORKER_PARALLEL=6

:loop
python worker.py
echo.
echo Воркер остановился, перезапуск через 10 секунд. Лог: worker.log
timeout /t 10 /nobreak >nul
goto loop
