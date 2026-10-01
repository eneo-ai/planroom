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
PUT /api/documents/:id/status body {expectedVersion,status} -> DocumentSummary; status-only metadata update preserves HTML revision and GitHub references.
PUT /api/documents/:id/github-links body {expectedLinksVersion,githubLinks:string[]} -> DocumentGitHubLinks; returns only githubLinks and githubLinksVersion, preserving all planning content, status and HTML revision.
GET /api/documents/:id/github-links -> DocumentGitHubLinks without loading HTML.
GET /api/documents/:id/revisions -> {revisions:RevisionSummary[]}
GET /api/documents/:id/revisions/:number -> RevisionDetail
POST /api/documents/:id/revisions/:number/restore body {expectedVersion,changeSummary} -> DocumentDetail
GET /api/documents/:id/comments -> {comments:Comment[]}
POST /api/documents/:id/comments body {body,sectionId?} -> Comment (201)
GET /api/documents/:id/export -> HTML attachment (auth required)
GET /api/tokens -> {tokens:ApiToken[]}; metadata includes expiresAt and maskedToken (eight asterisks followed by the last four secret characters), never the complete secret. Historical keys with no stored suffix return maskedToken:null.
POST /api/tokens body {name,scope:'read'|'write'} -> {token:string,record:ApiToken}; secret shown once, expires 90 days after creation. Create a replacement before expiry and update the client manually.
DELETE /api/tokens/:id -> {ok:true}
GET /api/admin/users -> {users:User[]}
POST /api/admin/users body {name,email,password,role} -> {user}; new users must change password.
POST /api/mcp official SDK stateless Streamable HTTP; bearer token required, browser cookie not accepted.
GET /api/health -> {status:'ok'} if DB reachable, 503 otherwise.

JSON reads, including MCP, are limited to 3 MiB and 30 seconds. Timeout returns 408 BODY_TIMEOUT; client abort returns 400 REQUEST_ABORTED. Document creation, updates, restores and comments revalidate the current credential, account role and key scope under transaction locks before writing. Revoked/expired credentials return 401; reduced permissions return 403. Writes ordered before a revocation may complete; writes ordered after it cannot use the stale request identity.

Lifecycle: draft (Utkast), active (Aktiv planering), ready (Redo för utveckling), in_development (Under utveckling), completed (Klart), archived (Arkiverat). Only draft and active permit changing title, description, HTML and instructions or restoring history. Locked content writes return 409 DOCUMENT_LOCKED with currentRevision. A full-content write cannot reopen a locked plan; explicitly change status to draft or active through the status operation first. Discussion and GitHub references remain writable with editor/admin and write scope. All writes use the existing authorization and document locks. There are no required linear transitions; reopening changes metadata without a revision.

DocumentSummary and DocumentDetail include version, githubLinks and githubLinksVersion. RevisionDetail preserves the metadata snapshot taken with that HTML, including GitHub references. Only byte-for-byte changed HTML creates a new immutable revision; title, description, status and instructions are current metadata, captured as a snapshot when HTML changes. Existing revisions remain intact. Full-content, status and restore writes require version as expectedVersion. DOCUMENT_CONFLICT includes currentVersion; read/reconcile before resubmitting. Identical content/status saves do not advance version or timestamps.

GitHub references have independent optimistic concurrency: read githubLinksVersion as expectedLinksVersion. GITHUB_LINKS_CONFLICT requires fetching/reconciling the latest list. A link write returns no HTML and does not change plan version, HTML revision, author or updatedAt. Identical link writes do not advance githubLinksVersion. References are up to 20 unique HTTPS github.com issue or pull-request URLs; queries, fragments and trailing slashes are removed on input. Full-content updates retain references; restoration retains current references. Linking does not contact or modify GitHub. MCP exposes read_document_github_links, update_document_status and update_document_github_links with the same contracts and permissions.

Migration 002 backfills existing keys to created_at + 90 days. Keys already older than 90 days receive a one-time 90-day transition window from migration; all subsequent keys use the normal lifetime. The original migration is unchanged.
Migration 003 widens the status constraint and adds an empty GitHub reference list to historical revisions. Migration 004 persists only new keys' final four characters alongside their hashes; historical suffixes cannot be recovered. Neither migration changes key lifetime or authentication. Migration 005 moves current metadata from the current revision to documents, initializes independent document/link versions to 1, and preserves all historical HTML, revision numbers and metadata snapshots.

Pages: /api/docs (public REST reference); /login; /setup (force initial replacement); / (dashboard); /documents/new; /documents/:id; /settings (account/tokens/admin).
UI should preserve editor content on 409, show actionable conflict and offer explicit reload; no silent overwrite.
Viewer preview uses iframe srcDoc, sandbox='' by default. Reader can explicitly enable demo interactivity with sandbox='allow-scripts'; NO allow-same-origin, no referrer. Parent never trusts document messages. A restrictive injected CSP blocks network resources/connect/forms; inline scripts only allowed for opt-in demos, no external scripts. Arbitrary scripts can navigate their own frame and transmit data: do not claim CSP prevents this; explain opt-in risk. Inline SVG supported. External fonts/images blocked initially; document this visibly.
No content security policy that permits imported HTML to run in parent DOM. HTML revisions never sanitized destructively before storing.
Script consent belongs to the currently displayed source and resets on source changes. The preview can expand in an Astryx fullscreen dialog, with one iframe and the same isolation. Switching display mode remounts the frame and resets temporary demonstration controls; source and saved revisions remain intact.
