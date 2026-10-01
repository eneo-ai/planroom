# Integration contract (authoritative alongside src/contracts.ts)

All REST APIs return plain JSON objects, no data envelope. Errors: {error:{code,message,currentRevision?,currentVersion?}}.
All REST handler routes use the dynamic Node runtime. Workspace data remains authenticated; API discovery, OpenAPI metadata and health are public. Same-origin cookie mutations checked for CSRF.
An explicit Authorization header selects bearer authentication. Its scheme is case-insensitive; malformed/invalid headers never fall back to a browser session. Without that header, REST can use a session cookie; MCP always requires a personal key. MCP refreshes authentication after reading a request body before exposing tools.
GET /api -> discovery links for /api/docs, /api/openapi.json and separate /api/mcp.
GET /api/openapi.json -> OpenAPI 3.1 generated from the canonical Zod request and response schemas in src/contracts.ts.
/api/docs -> public, bundled Scalar reference with manual same-origin API requests, explicit bearer authentication, no ambient cookies and no key persistence. Session-only account/key mutations and administration use the regular workspace.
POST /api/auth/login body {email,password} -> {user}; sets httpOnly session cookie.
Five failed logins within ten minutes lock the email for ten full minutes from the fifth failure. The fifth response is 401; further attempts, including a correct password, return 429 until the lock expires. A successful login clears that email's failure counter. Login admission permits four concurrent requests without queuing and 60 attempts/minute across the installation. All password derivations share a four-operation limit; excess setup/admin/login work returns 429 AUTH_BUSY.
GET /api/auth/session -> {user: User|null}
POST /api/auth/logout -> {ok:true}; expires cookie.
POST /api/auth/setup body {name,email,currentPassword,password} -> {user}; changes initial credentials, rotates sessions. Allowed for any signed-in user; requires current password.
GET /api/documents?q=&status= -> {documents:DocumentSummary[]}
POST /api/documents body DocumentContent -> DocumentDetail (201)
GET /api/documents/:id -> DocumentDetail
PUT /api/documents/:id body DocumentUpdate -> DocumentDetail (409 DOCUMENT_CONFLICT on stale document version)
PUT /api/documents/:id/status body {expectedVersion,status} -> DocumentSummary; status-only metadata update preserves the file revision and GitHub references.
PUT /api/documents/:id/github-links body {expectedLinksVersion,githubLinks:string[]} -> DocumentGitHubLinks; returns only githubLinks and githubLinksVersion, preserving all planning content, status and file revision.
GET /api/documents/:id/github-links -> DocumentGitHubLinks without loading HTML.
GET /api/documents/:id/revisions -> {revisions:RevisionSummary[]}
GET /api/documents/:id/revisions/:number -> RevisionDetail
POST /api/documents/:id/revisions/:number/restore body {expectedVersion,changeSummary} -> DocumentDetail
GET /api/documents/:id/comments -> {comments:Comment[]}
POST /api/documents/:id/comments body {body,sectionId?} -> Comment (201)
GET /api/documents/:id/export?fileId=:uuid -> original HTML or Markdown attachment (auth required). fileId is required for multi-file plans (400 FILE_REQUIRED if absent); a single-file plan exports its sole file when omitted. Unknown file IDs return 404. Content-Disposition preserves the original filename via UTF-8 filename* and includes a safe readable fallback with the file revision.
GET /api/tokens -> {tokens:ApiToken[]}; metadata includes expiresAt and maskedToken (eight asterisks followed by the last four secret characters), never the complete secret. Historical keys with no stored suffix return maskedToken:null.
POST /api/tokens body {name,scope:'read'|'write'} -> {token:string,record:ApiToken}; secret shown once, expires 90 days after creation. Create a replacement before expiry and update the client manually.
DELETE /api/tokens/:id -> {ok:true}
GET /api/admin/users -> {users:User[]}
POST /api/admin/users body {name,email,password,role} -> {user}; new users must change password.
POST /api/mcp official SDK stateless Streamable HTTP; bearer token required, browser cookie not accepted.
GET /api/health -> {status:'ok'} if DB reachable, 503 otherwise.

JSON reads, including MCP, are limited to 3 MiB and 30 seconds. Timeout returns 408 BODY_TIMEOUT; client abort returns 400 REQUEST_ABORTED. Document creation, updates, restores and comments revalidate the current credential, account role and key scope under transaction locks before writing. Revoked/expired credentials return 401; reduced permissions return 403. Writes ordered before a revocation may complete; writes ordered after it cannot use the stale request identity.

Lifecycle: draft (Utkast), active (Aktiv planering), ready (Redo för utveckling), in_development (Under utveckling), completed (Klart), archived (Arkiverat). Only draft and active permit changing title, description, files and instructions or restoring history. Locked content writes return 409 DOCUMENT_LOCKED with currentRevision. A full-content write cannot reopen a locked plan; explicitly change status to draft or active through the status operation first. Discussion and GitHub references remain writable with editor/admin and write scope. All writes use the existing authorization and document locks. There are no required linear transitions; reopening changes metadata without a revision.

DocumentSummary and DocumentDetail include version, githubLinks and githubLinksVersion. RevisionDetail preserves the metadata snapshot taken with that file collection, including GitHub references. Only a changed file collection (IDs, filenames, formats, order or original sources) creates a new immutable revision; title, description, status and instructions are current metadata, captured as a snapshot when files change. Existing revisions remain intact. Full-content, status and restore writes require version as expectedVersion. DOCUMENT_CONFLICT includes currentVersion; read/reconcile before resubmitting. Identical content/status saves do not advance version or timestamps.

GitHub references have independent optimistic concurrency: read githubLinksVersion as expectedLinksVersion. GITHUB_LINKS_CONFLICT requires fetching/reconciling the latest list. A link write returns no file sources and does not change plan version, file revision, author or updatedAt. Identical link writes do not advance githubLinksVersion. References are up to 20 unique HTTPS github.com issue or pull-request URLs; queries, fragments and trailing slashes are removed on input. Full-content updates retain references; restoration retains current references. Linking does not contact or modify GitHub. MCP exposes read_document_github_links, update_document_status and update_document_github_links with the same contracts and permissions.

DocumentContent/DocumentUpdate and DocumentDetail/RevisionDetail use files: [{id: UUID, name: string, format: 'html'|'markdown', content: string}], replacing the former html field. A plan contains 1–20 files, any mixture of HTML and Markdown, with unique IDs and case-insensitive unique names. Names are at most 200 characters, contain no path separators or control characters and use .html/.htm for HTML or .md/.markdown for Markdown (case-insensitive). File names and sources must be well-formed Unicode without NUL, which PostgreSQL JSONB cannot preserve. Each source is nonempty; sources total at most 2,000,000 characters. The independent 3 MiB JSON body limit still applies, including UTF-8 encoding/escaping. No trimming, sanitization or Markdown-to-HTML conversion is persisted. Summary listings include only file id/name/format, never source content.

A content write replaces the complete collection: include every file to retain and preserve its ID. Adding/removing/renaming/editing files uses the same revision, credential and lifecycle locks as other content. Status and GitHub writes preserve the collection without creating revisions; restoring copies the complete historical collection while retaining current GitHub references. MCP uses the same file contracts; clients sending html must switch to files. There is no parallel legacy write path.

Markdown is rendered as GFM (headings, tables, task lists and code fences) in the existing isolated iframe. Embedded HTML is escaped as text and scripts cannot be enabled for Markdown. Native heading anchors remain inside srcdoc. External resources remain restricted by the existing preview CSP. The original .md source is exported, never generated preview HTML.

Migration 006 backfills every historical HTML revision into one file named planering.html, using the document UUID as its stable file ID, preserves the original source exactly and drops the old html column. Deploy the new application and migration together after backup. An older image requires the matching database backup: mixed/Markdown revisions cannot be represented by its HTML-only model.

Migration 002 backfills existing keys to created_at + 90 days. Keys already older than 90 days receive a one-time 90-day transition window from migration; all subsequent keys use the normal lifetime. The original migration is unchanged.
Migration 003 widens the status constraint and adds an empty GitHub reference list to historical revisions. Migration 004 persists only new keys' final four characters alongside their hashes; historical suffixes cannot be recovered. Neither migration changes key lifetime or authentication. Migration 005 moves current metadata from the current revision to documents, initializes independent document/link versions to 1, and preserves all historical HTML, revision numbers and metadata snapshots.

Pages: /api/docs (public REST reference); /login; /setup (force initial replacement); / (dashboard); /documents/new; /documents/:id; /settings (account/tokens/admin).
UI should preserve editor content on 409, show actionable conflict and offer explicit reload; no silent overwrite.
Viewer preview uses iframe srcDoc, sandbox='' by default. Reader can explicitly enable demo interactivity with sandbox='allow-scripts'; NO allow-same-origin, no referrer. Parent never trusts document messages. A restrictive injected CSP blocks network resources/connect/forms; inline scripts only allowed for opt-in demos, no external scripts. Arbitrary scripts can navigate their own frame and transmit data: do not claim CSP prevents this; explain opt-in risk. Inline SVG supported. External fonts/images blocked initially; document this visibly.
No content security policy that permits imported HTML to run in parent DOM. HTML revisions never sanitized destructively before storing.
Script consent belongs to the currently displayed source and resets on source changes. The preview can expand in an Astryx fullscreen dialog, with one iframe and the same isolation. Switching display mode remounts the frame and resets temporary demonstration controls; source and saved revisions remain intact.

## AI canvas

DocumentDetail and RevisionDetail include `canvas: null | {schemaVersion: 1, title, shapes}`. The nullable snapshot is stored with the immutable file collection. Lists omit canvas bodies. File-only writes preserve the current canvas; restore copies both files and canvas, retaining current GitHub references.

`GET /api/documents/{id}/canvas` returns `{documentId, version, currentRevision, status, canvas}` without file bodies. `POST` takes `{expectedVersion, changeSummary, operations}` and returns the same saved state. Authentication, scope, live credential locks and draft/active editability match document writes. Conflicts return DOCUMENT_CONFLICT/currentVersion. Invalid scene references or removals return INVALID_CANVAS_OPERATION with no persistence. Changed batches create one content revision and advance document version; identical batches are no-ops.

Operations are `upsert` with a complete shape, `remove` with an existing id, or `rename` with a title. Upsert affects only that id. Removing a node removes incident arrows. At most 300 operations per request and 300 shapes per scene; final validity is checked atomically, so arrows may precede their nodes in the batch. IDs use 1–80 ASCII letters/digits/underscore/hyphen. A node has `type: rectangle|ellipse|diamond|note|text`, `id`, `text`, finite `x/y` (±20000), `width` (80–2000, default 240), `height` (60–2000, default 120) and `color: neutral|blue|green|orange|red|violet` (default neutral). An arrow has type arrow, id, distinct existing node startId/endId, text (default empty) and color. Text is literal well-formed Unicode without NUL, at most 4000 characters per shape and 100000 per scene. Unknown keys and active/embed content are rejected. The existing HTTP/MCP body limits also apply.

MCP read_canvas exposes the read contract. apply_canvas_operations adds document `id` to the POST contract and is advertised only for write-scoped admin/editor identities. The visualize_plan prompt takes documentId/request and shares the product's drawing workflow. AI should read read_document and read_canvas before drawing, preserve original files and unrelated shapes, batch coherent edits, use consistent visual hierarchy, and reread/reconcile after conflicts.

`GET /api/canvas/config` is authenticated and returns `{licenseKey: string|null}` from TLDRAW_LICENSE_KEY. This key is intended for browser SDK validation, not model-provider authentication. Development can use the SDK without a production key; production requires an appropriate tldraw license.
