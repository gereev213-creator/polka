@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Адрес сервера Полки
set POLKA_SERVER=https://polka-mini-app-nikicev2009.mia0.amvera.tech

REM Токен воркера — такой же, как LIVE_WORKER_TOKEN в Amvera
set LIVE_WORKER_TOKEN=ВСТАВЬТЕ_ТОКЕН

REM Папка профиля Chromium (старый профиль сборщика или worker\profile)
set AVITO_PROFILE=%~dp0profile

REM Активных ссылок на воркере может быть много; сервер сам считает интервал.
python worker.py

echo.
echo Воркер остановлен. Лог: worker.log
pause
