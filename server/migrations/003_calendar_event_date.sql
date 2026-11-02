ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS event_date DATE;

UPDATE calendar_events
SET event_date = make_date(2026, 11, date)
WHERE event_date IS NULL AND date BETWEEN 1 AND 30;
