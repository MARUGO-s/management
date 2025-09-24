-- Temporarily align admin password hash with system password hash for recovery
UPDATE password_management
SET password_hash = 'b441ded1b846d700900698d6999f5116a97ab912c96cdfc18f20ad667bcf6b6c',
    updated_at = NOW()
WHERE password_type = 'admin';
