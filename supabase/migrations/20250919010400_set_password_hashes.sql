-- Set secure but memorable passwords for system and admin access
UPDATE password_management
SET password_hash = CASE password_type
    WHEN 'system' THEN 'cd4e8fb41c27cc7d6339c8f3ca772f74c6bd7fe095dbe533a74e1db8bbec7cd0'
    WHEN 'admin' THEN '53443f8fc401ffa289a81ee9b630893cb370ee43facb1d36c40539b461f9750b'
END,
    updated_at = NOW()
WHERE password_type IN ('system', 'admin');
