@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set PYTHONUTF8=1

rem ============================================================================
rem  Сборщик ПОЛКИ на Windows. Запускать ДВОЙНЫМ КЛИКОМ (или из cmd).
rem  При запуске сам скачивает свежий collect.py с GitHub и правит config.json —
rem  отдельно обновлять файлы не нужно, достаточно перезапустить этот .bat.
rem ============================================================================

rem --- Профиль браузера: здесь хранится решённая проверка Авито ---------------
set "AVITO_PROFILE=%~dp0profile"

rem --- Искать по тексту запроса (q=) и по ссылкам, а не обходить раздел ------
set "POLKA_SEARCH_BY_QUERY=1"
rem --- Пауза между страницами: браузер и так медленный ------------------------
set "POLKA_REQUEST_GAP=15"
set "POLKA_REQUEST_GAP_MAX=30"
rem --- Проверку Авито ждём 2 минуты, потом идём дальше ------------------------
set "POLKA_MANUAL_WAIT=120"
rem --- Карточки объявлений не открываем: они палят IP ------------------------
set "POLKA_DETAILS_PER_PASS=0"
rem --- Ритм: проход ~5 минут, ссылки проверяются в каждом проходе ------------
set "POLKA_EVERY=300"

where python >nul 2>&1
if errorlevel 1 (
  echo Python not found in PATH.
  echo Install Python 3.12 from python.org and check "Add python.exe to PATH".
  pause
  exit /b 1
)

if not exist config.json (
  echo config.json not found. Copy it from the other computer into this folder.
  pause
  exit /b 1
)

rem --- 1. Обновляем сам сборщик до последней версии --------------------------
rem  GitHub raw кеширует файлы, поэтому добавляем ?v=случайное_число.
echo Updating collector...
curl -L --silent --show-error --max-time 90 -o collect.py.new "https://raw.githubusercontent.com/gereev213-creator/polka/master/collector/collect.py?v=%RANDOM%%RANDOM%" 2>nul
if exist collect.py.new (
  findstr /C:"LINK_SEEN_KEEP" collect.py.new >nul 2>&1
  if not errorlevel 1 (
    move /Y collect.py.new collect.py >nul
    echo Collector updated.
  ) else (
    del /Q collect.py.new >nul 2>&1
    echo Update failed - keeping the current collector.
  )
) else (
  echo No internet for update - keeping the current collector.
)

rem --- 2. Правим настройки в config.json (идемпотентно) ----------------------
python -c "import json;c=json.load(open('config.json',encoding='utf-8'));c.update({'search_by_query':1,'details_per_pass':0,'word_targets_per_pass':6,'check_listings':0,'no_block_sleep':True,'max_targets':3,'check_interval_min':5});json.dump(c,open('config.json','w',encoding='utf-8'),ensure_ascii=False,indent=1);print('config ok')"

if not exist logs mkdir logs

echo.
echo Starting collector. Chromium window will open - do not close it.
echo Link searches are checked first; new listings go to the app chat.
echo.

:loop
python -u collect.py --loop --every 300
echo.
echo Collector stopped, restart in 20 seconds (Ctrl+C to exit).
timeout /t 20 /nobreak >nul
goto loop
