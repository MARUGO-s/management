-- Rotate password hashes to remove known defaults
INSERT INTO password_management (password_type, password_hash)
VALUES
    ('system', 'b441ded1b846d700900698d6999f5116a97ab912c96cdfc18f20ad667bcf6b6c'),
    ('admin', '61b752f5e77e87c4c62127e3d329966edaef564639280fb63e351df9ce12560a')
ON CONFLICT (password_type) DO UPDATE
SET
    password_hash = EXCLUDED.password_hash,
    updated_at = NOW();
