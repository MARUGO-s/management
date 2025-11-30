ALTER TABLE access_logs
    ADD COLUMN IF NOT EXISTS api_call_count INTEGER DEFAULT 0;

UPDATE access_logs
SET api_call_count = 0
WHERE api_call_count IS NULL;
