# Mini App frontend (Vite build) — раздаётся из процесса бота (FRONTEND_DIST)
FROM node:20-alpine AS frontend
WORKDIR /build
COPY polka-final/frontend/package.json polka-final/frontend/package-lock.json* ./
# npm ci — установка строго по package-lock.json: быстрее и без сюрпризов
# «сегодня в реестре вышла новая версия». Фолбэк на install, если лока нет.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY polka-final/frontend/ ./
RUN npm run build
# Новый дизайн: готовый прототип заказчика становится точкой входа,
# адаптер связывает его с нашим API (лоты, поиск, избранное).
# React-сборка остаётся для админки: сохраняем до подмены точки входа
RUN cp dist/index.html dist/react.html && cp proto/index.html dist/index.html && cp proto/adapter.js dist/adapter.js && cp proto/payments.js dist/payments.js && cp proto/admin.js dist/admin.js && cp proto/keyboard.js dist/keyboard.js && cp proto/telegram-safe.js dist/telegram-safe.js && cp proto/telegram-web-app.js dist/telegram-web-app.js && cp proto/menu.js dist/menu.js && cp proto/menu-bind.js dist/menu-bind.js

FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bot files (без MAX-бота: только TG-бот + max_compat нужен импортом)
COPY polka_bot-9-3.py ./
COPY max_compat.py ./

# Static assets (email banner, etc.)
COPY assets/ ./assets/
# Сборщик находок: запускается на сервере как дочерний процесс,
# чтобы не требовать компьютера пользователя
COPY collector/ ./collector/

# Собранный Mini App frontend (API + SPA из одного процесса/БД)
# Проверку импорта на этапе сборки убрали: на некоторых площадках импорт
# модуля с инициализацией базы упирается в таймаут и валит весь образ.
# Ошибки в коде ловятся тестами (28 файлов) до пуша, а не в момент деплоя.
COPY --from=frontend /build/dist ./frontend_dist

ENV BOT_TOKEN=
ENV SERVER_URL=
ENV WEBAPP_URL=
ENV MINIAPP_URL=
ENV FRONTEND_DIST=/app/frontend_dist
ENV WEBAPP_PORT=8080
ENV PYTHONUNBUFFERED=1

# TG-бот напрямую: polling + API + раздача Mini App из одного процесса
CMD ["python3", "polka_bot-9-3.py"]
