-- Upgrade season start_date/end_date from YYYY-MM-DD to ISO 8601 datetime.
-- start_date: append T00:00:00Z (season starts at midnight UTC).
-- end_date:   append T23:59:00Z (preserves "inclusive whole day" semantics —
--             the old YYYY-MM-DD end_date meant "through end of that day").
UPDATE seasons SET start_date = start_date || 'T00:00:00Z' WHERE length(start_date) = 10;
UPDATE seasons SET end_date = end_date || 'T23:59:00Z' WHERE length(end_date) = 10;
