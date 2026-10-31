@echo off
setlocal
cd /d "%~dp0"

echo === Installing collector dependencies ===
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo Python not found in PATH.
  echo Install Python 3.12 from python.org and check "Add python.exe to PATH".
  pause
  exit /b 1
)

python -m pip install --upgrade pip
python -m pip install curl_cffi playwright
if errorlevel 1 (
  echo.
  echo Dependency install failed. Check internet connection and try again.
  pause
  exit /b 1
)

echo.
echo === Downloading Chromium for browser mode (about 150 MB) ===
python -m playwright install chromium
if errorlevel 1 (
  echo.
  echo Chromium download failed. Check internet connection and try again.
  pause
  exit /b 1
)

echo.
echo Done. Now run start-windows.bat
pause
