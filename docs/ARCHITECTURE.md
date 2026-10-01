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

Risk/recovery: shared login budgets can delay legitimate sign-in during abuse and require proxy rate/connection limits. Keys already older than 90 days receive one migration transition window; new keys always use 90 days. Migration 002 is additive and migration 001 remains immutable. Prefer retaining the added expiry column during an application rollback; keep a database backup and prior image. A successful legacy login upgrades the stored password format without rotating credentials; an older verifier cannot read the new format, so password-format recovery needs a compatible image or the matching backup. Preserve unpublished Git history in a private recovery bundle before removing the original supplied example from distributable branch histories. A maintainer controls the GitHub repository's visibility; initial distribution was private and the maintainer subsequently made it public.

## Astryx ownership and import cleanup

Problem: the import dropzone and list empty states still duplicated controls supplied by the installed Astryx library. This added drag state, native input resetting and custom styling to maintain.

Owner: HtmlImport retains HTML reading, the 2 MB limit and import lifecycle. Astryx FileInput owns selection, dropping, loading, disabled state, selection clearing and localized field feedback. Astryx EmptyState owns the empty planning, comments and API-key views. Reuse the existing library, theme and domain callbacks; delete the manual drag handlers, native input wrapper and obsolete CSS. Stored HTML, authentication, roles and document persistence do not change.

Acceptance: importing preserves the complete source, enforces the existing file limit, reports read errors, permits choosing the same file again and signals reading completion. Empty views retain their existing loading/error/role branches. AGENTS.md makes Astryx the canonical UI system and requires concrete justification for an exception.

Validation: supervised formatting and TypeScript; the focused HTML/consent contract tests; bounded Docker build and a manual import-control check when authorized. This standard-control substitution adds no dependency or schema migration. Recovery is reverting these UI files and rebuilding; persisted data is unaffected.

## Hosted Compose deployment

Problem: the canonical Compose stack published a fixed local port, creating an unnecessary server binding and possible conflicts in a shared Dokploy host. Its fixed app image name could also overlap with another installation.

Owner: compose.yaml remains the single app/database stack. Move only the local port mapping to the standard automatic compose.override.yaml and parameterize the app image name. Dokploy owns domains and proxy routing; it uses the base file explicitly. Reuse the existing Dockerfile, health checks, migrations, resource limits and internal database network. No authentication, HTML, database version, schema or persisted-data change.

Acceptance: default local Compose still binds 127.0.0.1:3210; explicit base-file deployment publishes no ports; database storage and network isolation remain intact. Each hosted installation has a unique project/image name, its own secrets and volume, and an exact HTTPS APP_URL. Verify the panel's final network configuration before deployment. Source Git fetches the public repository over HTTPS; private forks use a dedicated read-only repository deploy key and the SSH clone URL. When enabled, autodeploy tracks main only through Dokploy's native Compose webhook; keep its URL token private and verify a real push. Direct push deployment does not wait for CI.

Validation: supervised formatting and real Docker Compose configuration checks for local and base-only variants, without printing resolved secrets or starting containers. Then verify the intended organisation, reviewed commit, proxy routing, HTTPS and health on the remote installation when access is available. Recovery: revert the Compose change before deployment, or redeploy the previous app image under the same project name while retaining the database volume.

## Planning lifecycle, GitHub references and key identification

Problem: changing status requires editing the complete plan, there is no development handoff state, and a handed-off plan can still receive new HTML. Cards cannot reference GitHub work, and API keys cannot be identified by their visible suffix.

Current and proposed canonical owners: contracts.ts owns lifecycle states and write contracts; documents.ts continues to own all document mutations and immutable revisions; auth.ts continues to own API-key creation and metadata. GitHub references are typed URLs, validated by github-links.ts and stored with document revisions. HTTP and MCP remain thin adapters. Reuse Astryx Selector, Link, Button, Banner and existing card composition, authorization locks, revision preconditions and history. Consolidate the status control outside the existing editor rather than requiring a full-content write. No new persistence owner or GitHub authentication/synchronization service.

Acceptance: draft and active (active planning) permit content edits; ready, in_development, completed and archived freeze title, description, original HTML and AI instructions, including restoration. Editors can explicitly reopen a plan through a separate status operation. Status and GitHub-only writes preserve original content and create conflict-safe revisions. Discussion remains available. GitHub issue/PR URLs have recognizable links on cards and can be added or removed independently of content editing, including after handoff. Read-only users and tokens cannot write. New API keys return a masked identifier ending in their final four characters; the complete secret remains available only in the creation response. Existing keys have no recoverable suffix because only their hash was persisted, so they return a null identifier until replaced.

Deliberately unchanged: HTML preview isolation, original source preservation, account roles, authentication, key lifetime and full-secret disclosure at creation. No separate report model, remote GitHub writes, metadata fetching or automatic status synchronization.

Validation: supervised `npm run typecheck`, `npm test -- tests/contracts.test.ts tests/github-links.test.ts tests/openapi.test.ts tests/mcp.test.ts tests/html-preview.test.ts tests/html-preview-consent.test.ts tests/draft-navigation.test.ts`, and `npx prettier --check` on the changed Markdown, CSS and TypeScript files. Add PostgreSQL integration coverage for freeze/reopen, conflict races, reference history and secret suffix metadata; execute it only with an explicitly supplied disposable database. No server, full build or full suite is required.

Risk/recovery: migrations 003 and 004 are additive except for widening the existing status check; applied migrations remain immutable. Before deployment retain the previous image and a database backup. Older applications do not understand the two new status values; an application rollback needs those current statuses mapped back deliberately or the matching database backup. Retain the new reference/suffix columns on rollback. Frozen drafts may have been edited in another session; preserve their local text while refusing stale writes, and require reopening before editing again.
