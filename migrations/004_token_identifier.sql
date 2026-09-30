-- Existing secrets cannot be recovered from their hashes. Leave their suffix null.
ALTER TABLE api_tokens ADD COLUMN token_suffix text
  CHECK (token_suffix IS NULL OR token_suffix ~ '^[A-Za-z0-9_-]{4}$');
