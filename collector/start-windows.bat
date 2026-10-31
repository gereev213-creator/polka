@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1

rem --- Профиль браузера: здесь запоминается решённая проверка Авито ---
set AVITO_PROFILE=%~dp0profile

rem --- Искать по тексту запроса (q=), а не листать раздел ---
set POLKA_SEARCH_BY_QUERY=1

rem --- Браузер сам медленный; лишние минуты ожидания между страницами не нужны ---
set POLKA_REQUEST_GAP=15
set POLKA_REQUEST_GAP_MAX=30

rem --- Сколько ждать, пока вы решите проверку в окне браузера ---
set POLKA_MANUAL_WAIT=600

if not exist logs mkdir logs
if not exist config.json (
  echo Нет config.json — скопируйте его из папки collector на другом компьютере.
  pause
  exit /b 1
)

echo === %date% %time% запуск сборщика === >> logs\collector.log

:loop
python collect.py --loop --every 1200 >> logs\collector.log 2>&1
echo === %date% %time% сборщик завершился, перезапуск через 20 с === >> logs\collector.log
timeout /t 20 /nobreak >nul
goto loop
