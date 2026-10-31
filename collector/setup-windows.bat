@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Установка зависимостей сборщика ===
echo.
where python >nul 2>&1
if errorlevel 1 (
  echo Python не найден в PATH.
  echo Поставьте Python 3.12 с python.org и при установке отметьте "Add python.exe to PATH".
  pause
  exit /b 1
)
python -m pip install --upgrade pip
python -m pip install curl_cffi playwright
echo.
echo === Скачиваю Chromium для браузерного режима (около 150 МБ) ===
python -m playwright install chromium
echo.
echo Готово. Дальше: 1) положите config.json рядом, 2) запустите start-windows.bat
pause
