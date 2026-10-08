#!/usr/bin/env bash
# Одна команда делает всё: создаёт публичный репозиторий на GitHub, заливает
# код, прописывает секреты и запускает первый сбор.
#
# Запускать на Mac:  bash collector/deploy/github-setup.sh
set -e
cd "$(dirname "$0")/../.."
echo "Папка проекта: $(pwd)"

if ! command -v gh >/dev/null 2>&1; then
  echo "Нет GitHub CLI. Установите и запустите снова:"
  echo "    brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Сначала войдите в GitHub (откроется браузер, введите код):"
  echo "    gh auth login"
  exit 1
fi

TOKEN=$(python3 -c "import json;print(json.load(open('collector/config.json'))['token'])" 2>/dev/null || true)
SERVER=$(python3 -c "import json;print(json.load(open('collector/config.json'))['server'])" 2>/dev/null || true)
if [ -z "$TOKEN" ] || [ -z "$SERVER" ]; then
  echo "Не прочитал collector/config.json — проверьте, что он на месте и в нём есть token."
  exit 1
fi
echo "Сервер: $SERVER"
echo "Токен: задан (${#TOKEN} символов)"

LOGIN=$(gh api user --jq .login)
echo "Аккаунт GitHub: $LOGIN"

if gh repo view "$LOGIN/polka" >/dev/null 2>&1; then
  echo "Репозиторий polka уже есть — заливаю код в него"
  git remote remove github 2>/dev/null || true
  git remote add github "https://github.com/$LOGIN/polka.git"
  git push github master --force
else
  echo "Создаю публичный репозиторий polka и заливаю код…"
  gh repo create polka --public --source=. --remote=github --push
fi

echo "Прописываю секреты…"
gh secret set POLKA_SERVER --body "$SERVER" --repo "$LOGIN/polka"
gh secret set POLKA_INGEST_TOKEN --body "$TOKEN" --repo "$LOGIN/polka"

echo "Запускаю первый сбор…"
gh workflow run collector.yml --repo "$LOGIN/polka" || true
sleep 25
echo
echo "=== Последние запуски ==="
gh run list --repo "$LOGIN/polka" --limit 3

echo
echo "Готово. Дальше сбор идёт сам каждые 30 минут."
echo "Смотреть вживую:  gh run watch --repo $LOGIN/polka"
echo "Посмотреть лог:   gh run view --repo $LOGIN/polka --log"
echo
echo "Когда увидите в логе «принято N» — выключите сборщик на Mac:"
echo "    launchctl bootout gui/\$(id -u)/com.polka.collector"
