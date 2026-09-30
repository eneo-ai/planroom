# Integration contract (authoritative alongside src/contracts.ts)

All REST APIs return plain JSON objects, no data envelope. Errors: {error:{code,message,currentRevision?}}.
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
PUT /api/documents/:id body DocumentUpdate -> DocumentDetail (409 on stale revision)
GET /api/documents/:id/revisions -> {revisions:RevisionSummary[]}
GET /api/documents/:id/revisions/:number -> RevisionDetail
POST /api/documents/:id/revisions/:number/restore body {expectedRevision,changeSummary} -> DocumentDetail
GET /api/documents/:id/comments -> {comments:Comment[]}
POST /api/documents/:id/comments body {body,sectionId?} -> Comment (201)
GET /api/documents/:id/export -> HTML attachment (auth required)
GET /api/tokens -> {tokens:ApiToken[]}; metadata includes expiresAt, never a secret.
POST /api/tokens body {name,scope:'read'|'write'} -> {token:string,record:ApiToken}; secret shown once, expires 90 days after creation. Create a replacement before expiry and update the client manually.
DELETE /api/tokens/:id -> {ok:true}
GET /api/admin/users -> {users:User[]}
POST /api/admin/users body {name,email,password,role} -> {user}; new users must change password.
POST /api/mcp official SDK stateless Streamable HTTP; bearer token required, browser cookie not accepted.
GET /api/health -> {status:'ok'} if DB reachable, 503 otherwise.

JSON reads, including MCP, are limited to 3 MiB and 30 seconds. Timeout returns 408 BODY_TIMEOUT; client abort returns 400 REQUEST_ABORTED. Document creation, updates, restores and comments revalidate the current credential, account role and key scope under transaction locks before writing. Revoked/expired credentials return 401; reduced permissions return 403. Writes ordered before a revocation may complete; writes ordered after it cannot use the stale request identity.

Migration 002 backfills existing keys to created_at + 90 days. Keys already older than 90 days receive a one-time 90-day transition window from migration; all subsequent keys use the normal lifetime. The original migration is unchanged.

Pages: /api/docs (public REST reference); /login; /setup (force initial replacement); / (dashboard); /documents/new; /documents/:id; /settings (account/tokens/admin).
UI should preserve editor content on 409, show actionable conflict and offer explicit reload; no silent overwrite.
Viewer preview uses iframe srcDoc, sandbox='' by default. Reader can explicitly enable demo interactivity with sandbox='allow-scripts'; NO allow-same-origin, no referrer. Parent never trusts document messages. A restrictive injected CSP blocks network resources/connect/forms; inline scripts only allowed for opt-in demos, no external scripts. Arbitrary scripts can navigate their own frame and transmit data: do not claim CSP prevents this; explain opt-in risk. Inline SVG supported. External fonts/images blocked initially; document this visibly.
No content security policy that permits imported HTML to run in parent DOM. HTML revisions never sanitized destructively before storing.
Script consent belongs to the currently displayed source and resets on source changes. The preview can expand in an Astryx fullscreen dialog, with one iframe and the same isolation. Switching display mode remounts the frame and resets temporary demonstration controls; source and saved revisions remain intact.
