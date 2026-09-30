ALTER TABLE api_tokens ADD COLUMN expires_at timestamptz;
-- Existing keys receive their remaining lifetime. Keys already older than
-- ninety days get a transition window instead of silently expiring at deploy.
UPDATE api_tokens SET expires_at = CASE
  WHEN created_at + interval '90 days' > CURRENT_TIMESTAMP
    THEN created_at + interval '90 days'
  ELSE CURRENT_TIMESTAMP + interval '90 days'
END;
ALTER TABLE api_tokens ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE api_tokens ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + interval '90 days');
