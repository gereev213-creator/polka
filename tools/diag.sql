-- Диагностика находок. Запускать на живой базе через POST /api/admin/sql
-- (доступ: токен сборщика или админ из Mini App) либо в консоли Амверы.
-- Пример:
--   curl -s -X POST "$SERVER/api/admin/sql" \
--     -H "X-Ingest-Token: $TOKEN" -H 'Content-Type: application/json' \
--     -d '{"sql":"SELECT COUNT(*) FROM hunt_matches"}'

-- 1) Причины отказа за сутки: сразу видно, что именно отсекает находки.
--    Много title_words / category_mismatch — норма (шум Авито).
--    Много desc_failed — сборщик не может принести описания.
SELECT reason, COUNT(*) AS n FROM hunt_matches
WHERE status='rejected' AND updated_at >= date('now','-1 day')
GROUP BY reason ORDER BY n DESC;

-- 2) Застрявшие в отправке. Должно быть пусто: зависшие возвращает
--    hunt_flush_stale_sending при старте и в догоняющем цикле.
SELECT id, updated_at, reason, send_attempts FROM hunt_matches WHERE status='sending';

-- 3) Что уходит в чат. Одно объявление должно попадать в ОДИН критерий,
--    который ему подходит. Если один ad_id разошёлся по нескольким
--    несвязанным критериям — это ошибка сопоставления.
SELECT m.ad_id, a.title, a.price, COUNT(*) AS sent_to,
       GROUP_CONCAT(DISTINCT c.query) AS queries,
       GROUP_CONCAT(DISTINCT m.reason) AS reasons, MAX(m.updated_at) AS last
FROM hunt_matches m
LEFT JOIN hunt_criteria c ON c.id=m.crit_id
LEFT JOIN ads a ON a.id=m.ad_id
WHERE m.status='sent' AND m.updated_at >= date('now','-1 day')
GROUP BY m.ad_id ORDER BY sent_to DESC LIMIT 20;

-- 4) Сколько отправлено на каждый критерий за сутки.
SELECT m.crit_id, c.query, c.active, COUNT(*) AS n FROM hunt_matches m
LEFT JOIN hunt_criteria c ON c.id=m.crit_id
WHERE m.status='sent' AND m.updated_at >= date('now','-1 day')
GROUP BY m.crit_id ORDER BY n DESC;

-- 5) Общая картина по статусам: rejected растёт всегда, ready должен быстро
--    уходить в sent, sending — не задерживаться.
SELECT status, COUNT(*) AS n, MIN(updated_at) AS first, MAX(updated_at) AS last
FROM hunt_matches GROUP BY status ORDER BY n DESC;

-- 6) Почему у критерия нет находок: есть ли вообще объявления под него.
SELECT c.id, c.query, c.active, c.median_price, c.sample_size,
       (SELECT COUNT(*) FROM ads a WHERE a.status='active'
          AND (c.category IS NULL OR c.category='' OR a.category = c.category)) AS ads_in_category
FROM hunt_criteria c ORDER BY c.id;

-- 7) Здоровье приёма и очереди: приём не должен быть дольше секунды.
SELECT (SELECT COUNT(*) FROM ads WHERE source IS NOT NULL AND source <> 'polka') AS findings,
       (SELECT COUNT(*) FROM hunt_matches WHERE status='ready') AS ready,
       (SELECT COUNT(*) FROM hunt_matches WHERE status='pending_details') AS waiting_desc;
