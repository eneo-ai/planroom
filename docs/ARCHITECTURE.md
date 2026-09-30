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

## Security review and open source preparation

Problem: expensive login/password work and JSON reads were not sufficiently bounded; request identities could outlive revocation while bodies were read; preview script consent could survive a source change. Publishing also required a clear license, synthetic examples and reviewable supply-chain configuration.

Canonical owners remain auth.ts for identity and credential lifecycle, passwords.ts for password derivation admission and fixed versioned cost profiles, http.ts for bounded JSON reads, documents.ts for atomic authorized writes, and html-preview.ts/HtmlViewer for preview consent and display. Reuse existing PostgreSQL transactions, credential hashes, Zod schemas, Astryx dialogs and the official MCP SDK. Consolidate live write authorization in auth.ts and remove fake seed session identities and independent preview confirmation flags. The MCP adapter refreshes authentication after body reading. No new tenant, document ACL, OAuth or content sanitization layer.

Acceptance: five failed logins lock the email for ten full minutes from the fifth failure; global and concurrent work is bounded; timeout/abort paths cancel readers; revoked/expired credentials and reduced permissions cannot authorize later document writes; new keys expire after 90 days with visible metadata; mixed-case HTTPS still sets Secure; script consent is source-bound. Fullscreen reuses one isolated iframe. Repository examples are fictional, npm advisories are resolved and MIT/public contribution/deployment information is complete.

Validation: supervised TypeScript and focused HTTP/password/MCP/preview/configuration/OpenAPI tests; the disposable PostgreSQL integration fixture for lock ordering, failure counters, revocation and expiry migration; complete npm audit; Compose validation; bounded Docker startup and manual fullscreen verification when authorized. Scan the public Git history for configured secrets and known credential signatures without printing their values.

Risk/recovery: shared login budgets can delay legitimate sign-in during abuse and require proxy rate/connection limits. Keys already older than 90 days receive one migration transition window; new keys always use 90 days. Migration 002 is additive and migration 001 remains immutable. Prefer retaining the added expiry column during an application rollback; keep a database backup and prior image. A successful legacy login upgrades the stored password format without rotating credentials; an older verifier cannot read the new format, so password-format recovery needs a compatible image or the matching backup. Preserve unpublished Git history in a private recovery bundle before removing the original supplied example from distributable branch histories. The GitHub repository remains private until a maintainer explicitly approves public visibility.

## Astryx ownership and import cleanup

Problem: the import dropzone and list empty states still duplicated controls supplied by the installed Astryx library. This added drag state, native input resetting and custom styling to maintain.

Owner: HtmlImport retains HTML reading, the 2 MB limit and import lifecycle. Astryx FileInput owns selection, dropping, loading, disabled state, selection clearing and localized field feedback. Astryx EmptyState owns the empty planning, comments and API-key views. Reuse the existing library, theme and domain callbacks; delete the manual drag handlers, native input wrapper and obsolete CSS. Stored HTML, authentication, roles and document persistence do not change.

Acceptance: importing preserves the complete source, enforces the existing file limit, reports read errors, permits choosing the same file again and signals reading completion. Empty views retain their existing loading/error/role branches. AGENTS.md makes Astryx the canonical UI system and requires concrete justification for an exception.

Validation: supervised formatting and TypeScript; the focused HTML/consent contract tests; bounded Docker build and a manual import-control check when authorized. This standard-control substitution adds no dependency or schema migration. Recovery is reverting these UI files and rebuilding; persisted data is unaffected.
