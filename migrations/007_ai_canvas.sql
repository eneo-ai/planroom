-- Files and AI diagrams share one immutable content revision and write owner.
ALTER TABLE document_revisions ADD COLUMN canvas jsonb;
ALTER TABLE document_revisions ADD CONSTRAINT document_canvas_object
  CHECK (canvas IS NULL OR (
    jsonb_typeof(canvas) = 'object' AND canvas @> '{"schemaVersion":1}'::jsonb
  ));
