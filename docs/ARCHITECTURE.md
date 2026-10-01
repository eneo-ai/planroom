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

## HTML revisions and independent metadata

Problem: status and GitHub-only changes duplicate the entire HTML into revisions; link lists overwhelm cards and export looks like secondary navigation. Only a changed HTML source should create a revision.

Current owner: documents.ts writes all planning fields into immutable revisions. Proposed owner: the same module owns current metadata in documents and immutable HTML snapshots in document_revisions. Reuse authorization transactions, schemas, Astryx controls and existing history. Move current title, description, instructions, status and GitHub references to documents; remove the metadata-only revision write path and the redundant GitHub tab. Retain metadata snapshots alongside each HTML revision so history remains understandable. Existing revision numbers and original HTML are never rewritten or deduplicated.

Acceptance: unchanged HTML never inserts a revision, including metadata-only updates, status changes, identical saves and restoration of identical HTML. Changed HTML creates exactly one snapshot. Document version preconditions detect concurrent edits even when HTML revision stays unchanged. GitHub references have their own version and small metadata response; editing them preserves unsaved plan drafts and restoration never overwrites them. Existing data migrates from the current revision. Export downloads the saved original HTML through an Astryx button, with explicit feedback when a local draft exists. Bounded card links and a single accessible management dialog show repository, issue/PR type and number.

Deliberately unchanged: original HTML, preview isolation, lifecycle locks, discussion, key identification, roles, credentials and GitHub validation. No live GitHub metadata/API integration. REST/MCP clients must read version and supply expectedVersion for plan/status/restore writes, or githubLinksVersion as expectedLinksVersion for reference writes; no ambiguous legacy precondition fallback.

Validation: supervised focused contracts, OpenAPI, MCP, GitHub URL and export tests, formatting and TypeScript. PostgreSQL integration coverage proves metadata-only/no-op persistence, HTML snapshots, concurrent metadata and reference writes, frozen plans and migration backfill; run only when a disposable database is supplied. No server, E2E, full suite or production build.

Risk/recovery: migration 005 backfills current metadata; historical HTML and metadata snapshots remain intact. Keep a database backup and previous image before deploying. An application rollback needs the matching pre-migration database: an old writer would ignore updated current metadata. Retain the added columns; do not run the old writer against the new schema. Current metadata and link versions start at 1; historical revision numbers remain unchanged.

## Planning card hierarchy and GitHub link composition

Problem: cards have excessive vertical spacing, repetitive footer text and GitHub references whose icon/text split across lines. This makes the planning list slower to scan.

Owner: the dashboard owns card composition; document-github-links.tsx owns reference presentation. Keep both owners and reuse Astryx ClickableCard, Button and status controls. Extend the existing composition, grouping title/description and using compact library link-buttons for references; the complete reference list keeps its current owner. Remove the separate GitHub logo beside the list and the compact text-link branch that split icons from labels. No replacement controls or library focus/color overrides.

Acceptance: compact, aligned card headers and footers; readable titles/descriptions; explicit repo plus PR/Issue number in each compact link; full repository and new-tab behavior remain accessible; at most two links plus the remaining count; long labels stay inside narrow cards. Card navigation, nested status/link interactions, metadata writes, HTML revisions and permissions deliberately do not change.

Validation: supervised TypeScript, the existing document-action and GitHub contract tests, and formatting. Source review checks responsive wrapping, library-owned focus and independent nested links. No local server, browser/E2E test, full suite or production build. Risk/recovery: presentation only, with no migration; revert the UI commit to recover the previous composition.

## Multiple planning files and Markdown

Problem: a plan has one HTML source, so notes/specifications cannot accompany visualizations and Markdown-only plans are impossible. Current owner: contracts.ts defines the single source contract; documents.ts persists and restores it while keeping current metadata separate from source revisions. Proposed canonical owners remain those modules, with one typed file collection in each immutable revision.

Reuse: authorization/revision locks, lifecycle freezes, comments, instructions, HTTP/MCP adapters, native Astryx downloads, Astryx FileInput/Selector/TextInput/TextArea/Button/Dialog and the isolated HtmlViewer. Extend the existing editor and history compositions; replace the HTML-only import and persistence field. Delete the old html column after an exact-source backfill, without a second storage path or compatibility writer. Markdown parsing uses Marked to derive preview markup; it never changes persisted/exported source. Raw HTML in Markdown is escaped, and Markdown cannot enable scripts. The isolated frame needs local document typography because application components/theme cannot run inside its opaque sandbox; this exception is limited to preview content, with native system colors and no replacement application controls. Recheck it on Astryx upgrades.

Deliberately unchanged: accounts, scope, authentication, document statuses, freeze/reopen semantics and independent metadata/link versions, GitHub references, revision conflicts, discussion, instructions and HTML script consent/isolation. No filesystem, folder uploads, asset hosting, automatic cross-file navigation, remote synchronization or separate per-file revision stream.

Acceptance: each card supports 1–20 HTML/Markdown files in any mix, stable IDs and unique names, bounded original sources, atomic import, file selection and source editing, explicit removal, format-aware original downloads, immutable collection history and whole-collection restoration. Existing plans/history become single HTML files without source loss. List APIs return file metadata without source bodies. Content operations use the same lock and transaction; full replacements retain only the submitted files. File identity/name/format/order/source changes create a revision; metadata-only and identical saves do not. Existing expectedVersion/expectedLinksVersion contracts and current-reference restoration behavior remain intact.

Validation: guarded npm run typecheck; focused contract/import/Markdown/export/OpenAPI/MCP/preview/bridge tests with one worker; Prettier on this slice. PostgreSQL integration coverage tests the real migration, mixed collections, restore, metadata and existing freeze/conflict rules; execute only with an explicitly supplied disposable database. No server/full build/browser/full suite is authorized by this implementation request.

Risk/recovery: API clients must replace html with files. Migration 006 drops the single-source column after preserving all original text in JSONB; apply it with the matching application image after database backup. Application rollback requires the matching backup, since the former model cannot represent Markdown or several files. Drafts remain local and retain revision preconditions. No migration is applied to a user database during implementation.

## AI-generated native visualizations

Problem: AI can update planning files but cannot draw or refine a shared native diagram. Rendering arbitrary AI HTML in the application's DOM would violate the preview trust boundary. The feature prioritizes AI drawing through the existing MCP clients, with people directing and inspecting the result.

Current and proposed canonical owners: documents.ts remains the only persistence owner for current plans and immutable content revisions. canvas.ts owns the portable, versioned geometry/text contract, atomic operations and connector geometry; canvas-prompt.ts owns the workflow shared by the UI and MCP prompt. client/canvas-renderer.ts is the typed Excalidraw adapter; CanvasSurface owns the SDK lifecycle, camera and bounded PNG export; CanvasViewer owns display/fullscreen/text alternatives; DocumentCanvas owns the AI assignment and bounded refresh lifecycle. REST and MCP remain thin adapters.

Reuse existing transactions, live credential revalidation, document version preconditions, freeze/reopen states, history/restoration, original sources, Astryx controls and semantic theme tokens. Extend the existing content revision with a nullable canvas snapshot, without a second mutable store, dual writers or a WebSocket service. This is sufficient for AI batches; each changed atomic batch is durably saved as one revision and appears in the active tab through single-flight polling. Identical batches create no revision. Files and canvas are restored together; file-only edits preserve canvas. Metadata and GitHub-only behavior remains independent.

The SDK is dynamically loaded only for an existing diagram. Astryx owns application actions, fields, toolbar, empty states and fullscreen dialogs. The concrete design-system exception is the infinite-canvas rendering/gesture engine and intrinsic diagram visuals, which Astryx does not provide. Excalidraw 0.18.1 lacks a hideUi property: one scoped CSS rule hides its complete layer-ui__wrapper overlay, and the product viewer suppresses the native context menu. No control appearance, focus or theme overrides; the SDK uses light mode like the application. Recheck this small exception and native conversion tests on SDK upgrades. SDK fonts and the original SDK license are copied at install/build and served locally. The renderer accepts known geometry and literal text only: no HTML, embedded websites, images, scripts or remote URLs. View mode is controlled; paste, file drops, image tools and import/save actions are disabled. Human navigation never writes a scene to storage.

Acceptance: AI reads plan context and canvas, creates/refines objects with stable IDs, and writes bounded atomic batches with expectedVersion and a change summary. Read-only viewers/keys cannot draw. Frozen plans reject drawing and cached revoked credentials cannot save. Original files stay exact; historical previews/restores include the canvas. Active views refresh without overlapping reads, pause network reads in hidden browser tabs, abort on navigation and retain local file drafts/conflicts. Users can pan/zoom/expand/export and read an equivalent text view. PNG exports are capped to approximately 4000 pixels per dimension; shape and text limits bound storage and rendering.

Deliberately unchanged: no new model provider, model API keys, AI chat engine, human drawing editor, team/tenant model or public access. The UI explicitly copies an assignment for an already connected AI client; it does not imply a built-in model invocation. MCP offers read_canvas, apply_canvas_operations and visualize_plan. The MIT-licensed Excalidraw SDK requires no production key or subscription. The npm package does not supply an operated collaboration backend; Planroom's saved-batch refresh remains the collaboration mechanism.

Validation: supervised npm run typecheck; focused canvas behavior/native-SDK, MCP, OpenAPI, source export and preview tests; Prettier on changed files. Extend real PostgreSQL tests for canvas snapshots, no-ops, file preservation, restoration, malformed batches, races, status locks and revoked credentials. Run them in CI's disposable database, not against user data. No local server, full build, browser/E2E or full suite is authorized by this request.

Risk/recovery: migration 007_ai_canvas.sql only adds a nullable JSONB snapshot and a constraint. Keep the previous image and a database backup. An older writer would create revisions without the canvas, so rollback requires pausing writes and using the matching backup/image; retain the additive column. Existing historical sources are not rewritten. Version 1 is explicit; future canvas contract changes need migrations and versioned validation, not permissive legacy fallbacks.

## Excalidraw renderer replacement

Problem: the first canvas renderer introduced a commercial production license dependency. Excalidraw provides the required programmatic shapes, view mode, navigation and image export under MIT.

Owner: retain canvas.ts for persisted data and documents.ts for all mutations. Extend the existing canvas-renderer.ts and CanvasSurface with the pinned Excalidraw skeleton API, conversion, native text labels and explicit arrow bindings. Reuse CanvasViewer, Astryx controls, history, polling, API/MCP contracts and the install/build asset script. Delete tldraw and matching assets, the runtime license endpoint/schema, the configuration-fetch lifecycle and the Compose/environment variable. No dual-renderer or legacy scene import path.

Acceptance: existing version-1 scenes need no conversion or migration; every saved shape and literal label is represented; AI node movement updates connected arrows while keeping IDs; updates retain the user's camera; fullscreen, text alternatives and bounded PNG export remain. Production works without a key and diagram fonts are local. Invalid conversion/export has explicit user feedback without changing content.

Validation: guarded TypeScript, native SDK conversion in a small happy-dom unit-test environment using the SDK's text-metrics provider, existing canvas/MCP/OpenAPI/source-isolation tests, dependency audit, formatting and remote CI's disposable database/production image checks. DOM font/canvas shims cover only conversion setup and do not claim browser appearance or PNG rendering verification. No local server, full suite, production build or browser/E2E run.

Risk/recovery: the skeleton API is beta; pin 0.18.1 and rerun native conversion tests on upgrades. Scoped dependency overrides have an owner and deletion triggers in DEPLOYMENT.md. The scoped overlay selector is another explicit upgrade check. Revert the application commit to restore the previous renderer with its license configuration; saved diagrams and database history are unchanged.

## Canvas initialization repair

Problem: the saved diagram exists, but the viewer shows a white canvas. Excalidraw exposes its imperative API before its asynchronous scene initialization; the early update was then replaced by an empty initial scene. The production viewer confirmed zero SDK elements despite 37 saved objects.

Current and proposed owner: CanvasSurface retains the SDK lifecycle and camera. Reuse the native initialData contract and the SDK's post-loading onChange notification. Supply the initial scene declaratively, then apply subsequent updates only after initialization. Delete the assumption that API availability means scene readiness. No new persistence or rendering owner. Saved scenes, MCP, revisions, Astryx controls and HTML isolation deliberately remain unchanged.

Acceptance: the first mount and fullscreen remount retain all native shapes after SDK initialization; AI updates replace the scene while preserving the camera. A real SDK mount test protects against the white-canvas regression; its DOM/font/canvas shims establish lifecycle behavior, not pixel appearance. Validate with guarded focused tests, TypeScript and formatting, then inspect the existing deployed browser session. No local server, full build or browser/E2E runner. Risk/recovery: changes affect only viewer initialization; revert the application commit and rebuild without a database migration.
