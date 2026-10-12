-- Existing passwords and account activation behavior remain unchanged.
ALTER TABLE users ADD COLUMN password_reset_expires_at timestamptz;
ALTER TABLE users ADD COLUMN password_reset_used_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_password_reset_state CHECK (
  (password_reset_expires_at IS NULL AND password_reset_used_at IS NULL)
  OR (password_reset_expires_at IS NOT NULL AND must_change_password)
);
