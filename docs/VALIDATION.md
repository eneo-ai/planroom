# Validation record

Latest local verification: **2026-09-30**, after the security review, fullscreen preview, Astryx adoption and private repository preparation. Findings and their fixes are recorded in [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## Current security changes

| Check                                                           | Result                                                                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TypeScript, `npm run typecheck`                                 | Passed after the final authentication and Astryx changes                                                          |
| Focused backend, MCP and OpenAPI tests                          | 26 passed in the final run                                                                                        |
| PostgreSQL 17 disposable integration fixture                    | 19 passed; the fixture was removed                                                                                |
| HTML source, sandbox and consent tests                          | 12 passed after the Astryx changes, including 8 parser cases against the synthetic example                        |
| Reference transport, bridge, client configuration and contracts | Passed during this review                                                                                         |
| Private configuration behavior                                  | Passed: mode 0600, no overwrite, no secret output                                                                 |
| Complete npm dependency audit                                   | No advisories reported at any severity, including development dependencies                                        |
| `npm run format:check`, script syntax and `git diff --check`    | Passed                                                                                                            |
| Compose configuration                                           | Passed without printing resolved environment values                                                               |
| Hosted/local Compose variants                                   | Passed: local loopback binding, base-only deployment without published ports, isolated storage and runtime limits |
| Docker production build and bounded startup                     | Passed; app and database healthy                                                                                  |
| Running HTTP service                                            | Health, security headers, public discovery, OpenAPI and reference passed; anonymous document listing returns 401  |
| Fullscreen preview in the existing signed-in browser            | Layout visually checked; Escape closes and returns focus to Expandera; HTML remains in a sandboxed frame          |
| Astryx file import                                              | Layout checked; the synthetic example populated the draft title and HTML source without saving a document         |

The initial focused run exposed a test fixture still pointing to the removed internal example. The test now uses the synthetic example and its 8 parser cases passed on rerun. The final 26-test run covers the later password-format, bearer identity and delayed MCP-authentication changes. Counts from separate runs overlap and should not be added together.

The 19 real PostgreSQL tests cover immutable source/revisions, concurrent conflicts, restore, user roles and key scope, one-time bootstrap, account/session/key rotation, live write authorization after revocation or permission changes, ninety-day expiry and migration backfill, the fifth-failure lock deadline, bounded global/concurrent login work and the real MCP protocol. A delayed MCP read is rejected for both revoked and expired keys. A successful legacy login upgrades only its password hash and preserves existing credentials.

Manual preview verification used the existing planning document without changing its content, revisions, account or keys. The fullscreen dialog fills the available browser viewport and provides a visible close control. Only one HTML preview is visible; the editor has its own hidden, protected preview. Script execution remained disabled. Closing with Escape restored focus to Expandera.

The UI audit replaced the custom import dropzone with Astryx FileInput and the planning, comments and key empty views with Astryx EmptyState. AGENTS.md makes library reuse an explicit project requirement. A manual import of planning-demo.html populated an unsaved draft. Repeated-selection and keyboard chooser checks could not be completed through the in-app browser automation; they are not reported as passed. The temporary draft tab was closed without creating a document. The production image was rebuilt after these UI changes and both services became healthy.

## Execution and recovery

All local installations, tests, type/format checks and builds ran through the host's global resource supervisor, with one expensive job and one test worker. The final type/check run peaked at approximately 477 MiB of measured host process memory; PostgreSQL validation at 323 MiB; Docker startup's host CLI at 118 MiB.

Docker Desktop's VM is measured separately from that host process tree. The temporary builder was limited to 2 GiB and one CPU, with a 1536 MiB Node heap. Runtime limits are 1 GiB for the app and 512 MiB for PostgreSQL. These are safeguards rather than guarantees against every memory spike.

A private database backup and previous image were retained before migration 002. Startup preserved the existing administrator and documents. Test databases and temporary builders were cleaned up. The intended app and persistent database remain running.

The original internal example was removed from distributable Git history, with a private Git recovery bundle retained. The bounded publication scan reported no findings for reachable blobs checked against credential patterns and configured secret values. Private configuration, backups and the local agent policy are excluded. The scan is repeated for the final commit before pushing.

## Previous feature checks

Earlier focused checks verified clickable planning cards, Astryx focus styling, same-document HTML anchors, separate Codex/Claude Code/Claude Desktop instructions and the stdio bridge using the official MCP client. The interactive API reference was checked without credentials and returned 401 for document data despite an existing browser session, confirming that reference calls omit session cookies. No real personal key was created for those checks.

## Scope and limitations

This is a source and behavior review, not an independent penetration test, load assessment, automated full-browser suite or WCAG certification. Base-image operating-system packages were not certified by the npm audit. A shared reverse proxy and production backup restoration still need deployment-specific validation.

GitHub CI is configured to run the complete single-worker test set, type checking, dependency audit and Docker startup checks. Local results do not imply a successful GitHub run; its result must be inspected after the push. The maintainer made the repository public during the hosted deployment.

The initial private main commit ba0ccac passed [GitHub CI](https://github.com/eneo-ai/planroom/actions/runs/36763205589), including the complete test set and fresh Docker/database startup. The later hosted Compose configuration was checked with real Compose config for both automatic local override and explicit base-only deployment, without starting or changing local containers.

## Hosted deployment

Planroom is deployed as an independent Compose service in the eneo-dev organisation at `https://planroom.sundsvall.dev`, with a new database volume and installation-specific configuration. Source Git reads the public repository over HTTPS on main, without a GitHub account connection or deploy key. Dokploy's displayed command explicitly selects `./compose.yaml` and the unique project name. Its converted Compose preserves the app's database network and adds the external proxy network with an explicit Traefik network label. The database remains solely on its internal network, and no host ports are published.

The planning-lifecycle commit exposed a missing runtime source file: contracts.ts imports github-links.ts during bootstrap, but the runner image did not include that file. Dockerfile now copies that canonical module alongside contracts.ts. Commit c60542e passed [GitHub CI](https://github.com/eneo-ai/planroom/actions/runs/36771437149), including tests, dependency audit, image build, migrations, bootstrap and fresh server startup, and deployed successfully in Dokploy.

Remote checks passed with normal TLS verification: health, login, API discovery, OpenAPI 3.1 and the API reference returned 200. Anonymous document listing and an MCP initialize POST returned 401. HTTP redirects to HTTPS. The certificate covers the exact hostname, is issued by Let's Encrypt and expires on 2026-12-29. A fresh browser tab displayed the login page without a certificate warning; no browser warning was bypassed. The original certificate warning was not captured, so its earlier cause is not asserted.

Auto Deploy is enabled with the main push trigger and a repository push-only webhook using JSON and TLS verification. The webhook credential is retained only in private operator configuration. Direct push deployment does not wait for CI; the deployment guide describes this policy and the CI-controlled alternative. First-account replacement is an operator action in the UI. This remote smoke check did not change accounts, issue personal API keys or modify planning documents.
