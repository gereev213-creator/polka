Эта ветка — только для BOTHOST.

В ней нет Node-проекта фронтенда (package.json, vite.config.js, src),
поэтому платформа не путает Python-бота с Node и запускает polka_bot-9-3.py.
Собранный фронтенд лежит в polka-final/frontend/dist — его отдаёт сервер,
если задано FRONTEND_DIST=/app/polka-final/frontend/dist.

Исходники фронтенда остаются в ветке master (для Amvera и разработки).
