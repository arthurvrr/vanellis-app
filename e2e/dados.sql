-- Dados previsíveis para os testes de ponta a ponta, por cima da carga inicial: loja aberta
-- todos os dias das 7h às 21h, sem bloqueios nem restrições, antecedência de 2h, pedidos
-- abertos, preços visíveis e tele-entrega ligada para todos os dias.

DELETE FROM opening_hours;
DELETE FROM weekly_schedule;
DELETE FROM pickup_restriction;
DELETE FROM blocked_date;
DELETE FROM closed_period;
DELETE FROM special_date;

WITH s AS (INSERT INTO weekly_schedule (valid_from) VALUES ('2020-01-01') RETURNING id)
INSERT INTO opening_hours (schedule_id, weekday, open_time, close_time)
SELECT s.id, d, '07:00', '21:00' FROM s, generate_series(0, 6) AS d;

UPDATE agenda_config
SET min_lead_hours = 2, window_months = 4, orders_paused = false,
    delivery_enabled = true, delivery_all_days = true, delivery_dates = '{}';

UPDATE store_settings SET prices_hidden = false, message_template = NULL;
UPDATE product SET available = true;
