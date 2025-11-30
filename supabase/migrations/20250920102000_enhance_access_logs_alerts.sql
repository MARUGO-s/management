ALTER TABLE access_logs
    ADD COLUMN IF NOT EXISTS alert_flag BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;

UPDATE access_logs
SET alert_flag = CASE WHEN api_call_count >= 30 THEN true ELSE false END;

UPDATE access_logs
SET
    acknowledged = CASE WHEN api_call_count >= 30 THEN false ELSE true END,
    acknowledged_by = CASE WHEN api_call_count >= 30 THEN NULL ELSE COALESCE(acknowledged_by, 'system') END,
    acknowledged_at = CASE WHEN api_call_count >= 30 THEN NULL ELSE COALESCE(acknowledged_at, NOW()) END;
