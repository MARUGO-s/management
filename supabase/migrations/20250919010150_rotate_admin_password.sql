-- Ensure admin password hash is updated to the rotated value
UPDATE password_management
SET password_hash = '61b752f5e77e87c4c62127e3d329966edaef564639280fb63e351df9ce12560a',
    updated_at = NOW()
WHERE password_type = 'admin';
