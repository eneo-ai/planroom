ALTER TABLE document_revisions ADD COLUMN files jsonb;

-- The document id is a stable file id across all of its historical revisions.
-- Preserve the original HTML exactly, including whitespace and scripts.
UPDATE document_revisions
SET files = jsonb_build_array(jsonb_build_object(
  'id', document_id, 'name', 'planering.html', 'format', 'html', 'content', html
));

ALTER TABLE document_revisions ALTER COLUMN files SET NOT NULL;
ALTER TABLE document_revisions ADD CONSTRAINT document_revisions_files_limit
  CHECK (jsonb_typeof(files) = 'array' AND jsonb_array_length(files) BETWEEN 1 AND 20);
ALTER TABLE document_revisions DROP COLUMN html;
