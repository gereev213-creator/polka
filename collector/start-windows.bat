@echo off
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1

rem --- Browser profile: solved Avito check is stored here ---
set "AVITO_PROFILE=%~dp0profile"

rem --- Search by text query (q=) instead of browsing a section ---
set "POLKA_SEARCH_BY_QUERY=1"

rem --- Pacing between pages, browser is slow by itself ---
set "POLKA_REQUEST_GAP=15"
set "POLKA_REQUEST_GAP_MAX=30"

rem --- How long to wait for manual Avito check in browser window ---
set "POLKA_MANUAL_WAIT=600"

rem --- Details (descriptions, seller, params: battery/memory/size) ---
set "POLKA_DETAILS_PER_PASS=6"
rem --- Pauses between item pages: Avito blocks fast crawling ---
set "POLKA_DETAILS_PAUSE_MIN=40"
set "POLKA_DETAILS_PAUSE_MAX=80"

if not exist logs mkdir logs
if not exist config.json (
  echo config.json not found. Copy it from the other computer into this folder.
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo Python not found in PATH.
  echo Install Python 3.12 from python.org and check "Add python.exe to PATH".
  pause
  exit /b 1
)

echo Starting collector. Chromium window will open - do not close it.
echo.

:loop
python -u collect.py --loop --every 1200
echo.
echo Collector stopped, restart in 20 seconds (Ctrl+C to exit).
timeout /t 20 /nobreak >nul
goto loop
