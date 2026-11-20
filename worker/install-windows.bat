@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python не найден. Установите с python.org и включите "Add to PATH".
  pause
  exit /b 1
)
python -m pip install --upgrade pip
python -m pip install -r requirements-worker.txt
python -m playwright install chromium
echo.
echo Готово. Теперь откройте start-worker.bat и впишите токен и профиль.
pause
