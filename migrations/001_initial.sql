CREATE TABLE users (
  id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  password_hash text NOT NULL, role text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  must_change_password boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  secret_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE api_tokens (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, scope text NOT NULL CHECK(scope IN ('read','write')),
  secret_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz
);
CREATE INDEX api_tokens_user ON api_tokens(user_id);
CREATE TABLE documents (
  id uuid PRIMARY KEY, current_revision integer NOT NULL CHECK(current_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_revisions (
  id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK(number > 0), title text NOT NULL, description text NOT NULL,
  html text NOT NULL, instructions text NOT NULL, status text NOT NULL CHECK(status IN ('draft','active','completed','archived')),
  change_summary text NOT NULL, author_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, number)
);
ALTER TABLE documents ADD CONSTRAINT current_revision_exists FOREIGN KEY (id,current_revision)
  REFERENCES document_revisions(document_id,number) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE comments (
  id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id), body text NOT NULL, section_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_document ON comments(document_id,created_at);
CREATE TABLE login_attempts (subject_hash text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL);
CREATE TABLE bootstrap (key text PRIMARY KEY, completed_at timestamptz NOT NULL DEFAULT now());
