CREATE TABLE teams (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE team_memberships (
  team_id uuid NOT NULL REFERENCES teams(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  PRIMARY KEY (team_id,user_id)
);
CREATE INDEX team_memberships_user ON team_memberships(user_id,team_id);
CREATE TABLE projects (
  id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_team ON projects(team_id);

INSERT INTO teams(id,name,description)
VALUES('dca0733b-3325-4efa-9b43-2e71e537b001','Gemensamt team','Befintliga planeringar och medlemmar.');
INSERT INTO projects(id,team_id,name)
VALUES('dca0733b-3325-4efa-9b43-2e71e537b002','dca0733b-3325-4efa-9b43-2e71e537b001','Befintliga planeringar');
INSERT INTO team_memberships(team_id,user_id,role)
SELECT 'dca0733b-3325-4efa-9b43-2e71e537b001',id,
  CASE WHEN role='admin' THEN 'owner' ELSE role END FROM users;

ALTER TABLE documents ADD COLUMN project_id uuid REFERENCES projects(id);
UPDATE documents SET project_id='dca0733b-3325-4efa-9b43-2e71e537b002';
ALTER TABLE documents ALTER COLUMN project_id SET NOT NULL;
CREATE INDEX documents_project_updated ON documents(project_id,updated_at DESC,id DESC);
CREATE INDEX documents_updated ON documents(updated_at DESC,id DESC);
ALTER TABLE api_tokens ADD COLUMN team_id uuid REFERENCES teams(id);
UPDATE api_tokens SET team_id='dca0733b-3325-4efa-9b43-2e71e537b001';
ALTER TABLE api_tokens ALTER COLUMN team_id SET NOT NULL;

-- Team roles are the only source of content permissions. Global administrators
-- intentionally retain full oversight; ordinary accounts need membership.
ALTER TABLE users DROP CONSTRAINT users_role_check;
UPDATE users SET role=CASE WHEN role='admin' THEN 'global_admin' ELSE 'user' END;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('global_admin','user'));
