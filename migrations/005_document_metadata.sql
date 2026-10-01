-- Current metadata belongs to the document; HTML revision snapshots remain immutable.
ALTER TABLE documents
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN title text,
  ADD COLUMN description text,
  ADD COLUMN instructions text,
  ADD COLUMN status text CHECK (status IN ('draft', 'active', 'ready', 'in_development', 'completed', 'archived')),
  ADD COLUMN change_summary text,
  ADD COLUMN author_id uuid REFERENCES users(id),
  ADD COLUMN github_links text[] NOT NULL DEFAULT '{}' CHECK (cardinality(github_links) <= 20),
  ADD COLUMN github_links_version integer NOT NULL DEFAULT 1 CHECK (github_links_version > 0);

UPDATE documents d SET
  title=r.title, description=r.description, instructions=r.instructions,
  status=r.status, change_summary=r.change_summary, author_id=r.author_id,
  github_links=r.github_links
FROM document_revisions r WHERE r.document_id=d.id AND r.number=d.current_revision;

ALTER TABLE documents
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN instructions SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN change_summary SET NOT NULL,
  ALTER COLUMN author_id SET NOT NULL;

-- Existing revision snapshots, including their GitHub references, remain intact.
