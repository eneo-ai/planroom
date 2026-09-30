ALTER TABLE document_revisions DROP CONSTRAINT document_revisions_status_check;
ALTER TABLE document_revisions ADD CONSTRAINT document_revisions_status_check
  CHECK (status IN ('draft', 'active', 'ready', 'in_development', 'completed', 'archived'));
ALTER TABLE document_revisions ADD COLUMN github_links text[] NOT NULL DEFAULT '{}';
ALTER TABLE document_revisions ADD CONSTRAINT document_revisions_github_links_limit
  CHECK (cardinality(github_links) <= 20);
