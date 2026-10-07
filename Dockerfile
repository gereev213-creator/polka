# Mini App frontend (Vite build) — раздаётся из процесса бота (FRONTEND_DIST)
FROM node:20-alpine AS frontend
WORKDIR /build
COPY polka-final/frontend/package.json polka-final/frontend/package-lock.json* ./
RUN npm install
COPY polka-final/frontend/ ./
RUN npm run build

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
