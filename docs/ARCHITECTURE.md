# Planroom initial implementation

Problem: HTML planning documents are exchanged as attachments, losing shared context and authoritative versions.
Owner today: individual HTML files and chat conversations.
Canonical owner: documents application module, with immutable PostgreSQL revisions of HTML, title, description, status and AI instructions.
Reuse: Astryx UI and official MCP SDK; Node cryptography; PostgreSQL transactions.
Keep source HTML and its visualizations intact. Do not rebuild diagrams as application components.
Single workspace with admin/editor/viewer roles. No multi-tenant layer, AI conversation engine, live collaborative editor or Mattermost bot in this slice.
Acceptance: first-run admin bootstrap, forced account replacement, import, authenticated sharing, sandboxed preview with scripts, revision conflicts, restore, comments, admin users, scoped personal MCP tokens.
Validation: focused typecheck and behavior/contract tests; PostgreSQL integration tests when a disposable test database is explicitly provided. All local execution via the global run-guarded.py supervisor.
Recovery: immutable revisions, restore creates a revision; pg_dump backs up users, documents and history; HTML export prevents lock-in.
