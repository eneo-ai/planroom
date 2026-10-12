-- Public review is scoped to one planning item. Never copy a project token:
-- its holders were authorized for a different, broader scope.
ALTER TABLE documents ADD COLUMN public_share_token text
  CHECK (public_share_token ~ '^[A-Za-z0-9_-]{43}$');
ALTER TABLE documents ADD COLUMN public_share_version integer NOT NULL DEFAULT 1
  CHECK (public_share_version > 0);
CREATE UNIQUE INDEX documents_public_share_token ON documents(public_share_token)
  WHERE public_share_token IS NOT NULL;

-- Revoke all old project links without altering planning content or history.
ALTER TABLE projects DROP COLUMN public_share_token;
ALTER TABLE projects DROP COLUMN public_share_version;
