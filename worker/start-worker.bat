@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "POLKA_SERVER=https://polka-mini-app-nikicev2009.mia0.amvera.tech"
set "LIVE_WORKER_TOKEN=ВСТАВЬТЕ_ТОКЕН"
set "WORKER_PROFILE_HOME=%~dp0profile-home"
set "WORKER_PROFILE_PROXY=%~dp0profile-proxy"
set "WORKER_PROXY=socks5h://ЛОГИН:ПАРОЛЬ@bproxy.site:11542"
set "WORKER_ROTATE_URL=https://changeip.mobileproxy.space/?proxy_key=ВСТАВЬТЕ_КЛЮЧ&format=json"
set "WORKER_PARALLEL=6"

for /f "delims=" %%i in ('python -c "import certifi; print(certifi.where())" 2^>nul') do set "SSL_CERT_FILE=%%i"
if defined SSL_CERT_FILE set "REQUESTS_CA_BUNDLE=%SSL_CERT_FILE%"

:loop
python worker.py
echo.
echo Воркер остановился, перезапуск через 10 секунд. Лог: worker.log
timeout /t 10 /nobreak >nul
goto loop
