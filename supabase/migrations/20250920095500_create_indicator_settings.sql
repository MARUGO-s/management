CREATE TABLE IF NOT EXISTS indicator_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    orange_threshold INTEGER NOT NULL,
    yellow_threshold INTEGER NOT NULL,
    red_threshold INTEGER NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO indicator_settings (id, orange_threshold, yellow_threshold, red_threshold, updated_by)
VALUES (1, 900, 1500, 2400, 'system')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE indicator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manage indicator settings" ON indicator_settings
FOR ALL
USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role')
WITH CHECK (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
