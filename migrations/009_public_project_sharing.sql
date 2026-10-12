-- A project starts private. Only owners can retrieve or replace this bearer link.
ALTER TABLE projects ADD COLUMN public_share_token text
  CHECK (public_share_token ~ '^[A-Za-z0-9_-]{43}$');
ALTER TABLE projects ADD COLUMN public_share_version integer NOT NULL DEFAULT 1
  CHECK (public_share_version > 0);
CREATE UNIQUE INDEX projects_public_share_token ON projects(public_share_token)
  WHERE public_share_token IS NOT NULL;
