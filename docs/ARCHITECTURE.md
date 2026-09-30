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

## Preview and MCP usability repair

Problem: native fragment links in srcdoc resolved to the embedding app URL and produced a denied frame; only card headings navigated; global focus CSS overrode Astryx field rings; client-specific MCP setup was missing from the product.

Canonical owners: HtmlViewer owns the isolated preview lifecycle; Astryx ClickableCard and focus styling own interaction; the MCP guide owns client instructions; the existing HTTP MCP server owns authentication and tools. The Desktop stdio bridge is a thin protocol adapter with no document or authorization logic.

Reuse: original source and preview CSP, sandbox without same-origin access, official MCP SDK and Astryx controls. Delete the global focus override and heading-only navigation. Use srcdoc with a fixed about:srcdoc base for same-document anchors and a small optional Compose profile for Desktop. Both parent and preview CSP permit only the about: base scheme in the preview; the first fixed base precedes supplied markup. External base URLs remain blocked.

Acceptance: clicking anywhere on a planning card opens it, native document anchors retain the document, JavaScript remains opt-in, focus follows Astryx control shapes, all three clients have separate guides, and Desktop forwards the same scoped tools and revision conflicts.

Validation: focused typecheck and SDK behavior tests; manual verification in the existing authenticated browser after Docker update. No schema or stored document changes. Recovery: revert the application commit and rebuild; the database needs no migration or rollback.

## REST API discovery and reference

Problem: /api returned 404 and REST endpoints had no discoverable, browsable contract. Existing owners: request contracts in src/contracts.ts, response TypeScript interfaces, HTTP route adapters, and authentication in src/server/auth.ts.

Canonical owners: src/contracts.ts now owns executable request and response schemas; src/server/openapi.ts owns the OpenAPI 3.1 operation catalog and generates schemas from those contracts. Public /api discovery and /api/openapi.json expose metadata. Scalar renders that specification on /api/docs. SessionProvider owns public page access; AppFrame owns navigation.

Reuse: Zod's built-in JSON Schema generation, existing REST handlers, and the standard Scalar API reference. Consolidate client error validation into the canonical API error schema. No database, account, bearer scope, cookie authentication, MCP protocol, or document persistence changes.

Acceptance: /api returns useful discovery links; /api/docs is readable without login; all existing REST operations have accurate contracts, authentication and failure responses; bearer-based calls can be tried manually against the same origin. API reference transport requests do not send session cookies, persist keys, use a third-party proxy, or perform automatic writes.

Validation: focused OpenAPI coverage/schema and reference transport contract tests, TypeScript, Docker rebuild, and a manual public documentation/read-only health request check. Recovery: revert this commit and rebuild; no migration or stored-data recovery is required.
