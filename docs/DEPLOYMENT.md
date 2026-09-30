# Deployment and recovery

Planroom is early-stage, single-workspace software for a trusted team. Use individual accounts and HTTPS for a shared installation. Account disabling and password-recovery workflows are not yet implemented. Keep recoverable database backups and review [SECURITY.md](../SECURITY.md) before introducing sensitive data.

## Configuration and startup

Run `node scripts/configure.mjs` from a Node.js 22 environment to create a private `.env` with random secrets. It does not overwrite an existing file. Alternatively, copy `.env.example` and generate distinct passwords with `openssl rand -hex 24`. Hex avoids URL-escaping problems in the database connection string. No shared initial admin password is supplied.

| Variable                | Meaning                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`     | Random database password; use the generated hex format                             |
| `SEED_ADMIN_PASSWORD`   | Random initial account password, required by Compose; used only on first bootstrap |
| `SEED_ADMIN_EMAIL`      | Initial account email, default `admin@planroom.local`                              |
| `SEED_EXAMPLE`          | `true` imports a synthetic HTML planning example once                              |
| `APP_URL`               | Exact browser-facing origin, including scheme and port                             |
| `PLANROOM_PORT`         | Host port, default `3210`                                                          |
| `PLANROOM_BIND_ADDRESS` | Bind address, default `127.0.0.1`                                                  |

Protect `.env`, for example with `chmod 600 .env` on POSIX systems or restrictive Windows ACLs. Do not commit it, paste it into issues, or print resolved `docker compose config` output in shared logs. Docker inspection and container environments are visible to users with Docker access; they must be trusted operators. The Desktop bridge's environment also contains its personal API key.

`node scripts/start-local.mjs` creates a temporary Buildx Docker-container builder with a 2 GiB memory limit and one CPU, then starts Compose with a bounded health wait. Buildx 0.14 or later is required. Apply any host-specific supervisor required by AGENTS.md. Docker Desktop VM resources are not included in the CLI's host process tree. Run one build/test job at a time.

The app runs as UID 1001 with a read-only filesystem and small writable temporary caches. Runtime limits are 1 GiB/one CPU for the app, 512 MiB/one CPU for PostgreSQL and 256 MiB/half a CPU for the optional bridge. App and database logs rotate at 10 MiB with three retained files. These resource limits mitigate runaway execution; they do not establish the cause of a build failure.

Startup waits for PostgreSQL, applies checksum-verified migrations and completes transactional one-time bootstrap before accepting traffic. The initial account must be replaced in the UI. Restarting does not overwrite an existing account or document. The PostgreSQL named volume persists across container replacement. Database access uses a separate internal network; the database has no published port.

Changing `POSTGRES_PASSWORD` in `.env` does not change the password of an existing database role: rotate the database and app configuration together. Changing `SEED_ADMIN_PASSWORD` does not recover an existing account. Preserve administrator access through individual accounts and tested backup/recovery procedures.

## Shared HTTPS access

Use a reverse proxy with TLS and set `APP_URL`, for example `https://planroom.example`. It must match the address in the browser for same-origin write validation and secure session cookies. Keep loopback binding when the proxy runs on the same host. A containerized proxy can join the frontend network and forward to `app:3000`; it should not join the internal database network.

The proxy should bound incoming bodies and timeouts and support MCP's Streamable HTTP without buffering that breaks streaming. The app additionally limits parsed JSON bodies to 3 MiB. Do not expose PostgreSQL. Use private network access or additional deployment controls when your team does not need public ingress.

The HTTP MCP endpoint is part of the app. Claude Desktop optionally runs `docker compose run --rm --no-deps -T -e PLANROOM_API_KEY mcp-bridge` using a client-provided key. The bridge exposes no port and contains no database credentials. The app must already be running. Remote deployment URLs require HTTPS; loopback development and the internal `app:3000` connection are the only HTTP exceptions. Detailed client configurations are available under Settings → AI and API.

## Data and authentication boundaries

Every configured user can read every planning document in the workspace. Editor/admin users can change documents; viewers cannot comment or write. Personal keys inherit the user's role and chosen read/write scope. Account changes, key issuance/revocation and user administration require a browser session. Account replacement revokes the user's existing sessions and API keys.

New keys expire 90 days after issuance. Settings displays expiry; replace a client's key before its deadline, verify the replacement, then revoke the old key. Migration 002 adds this deadline to existing keys without changing migration 001: existing keys retain `created_at + 90 days`, while keys already older than 90 days receive a one-time 90-day transition window. Expired keys fail authentication. Document writes recheck the live credential, role and scope under transaction locks, so finishing a body after credential revocation cannot authorize a new write.

Five failed logins within ten minutes trigger a full ten-minute lock from the fifth failure. During the lock even valid credentials return 429. Successful sign-in clears the email's failure counter. The installation permits 60 login attempts/minute and four concurrent login operations; all password derivations also share a four-operation limit without a queue. Busy requests return 429. These application limits protect password/row growth, but cannot prevent a caller from exhausting the shared login budget or substitute for proxy connection limits.

Passwords use salted, versioned scrypt with fixed `N=32768, r=8, p=3`. Existing hashes are upgraded after a successful login under the same transaction as session issuance. The password, existing sessions and personal keys are retained. After that upgrade, an older application image cannot verify the new format; retain a compatible image or recover the matching protected database backup.

The MCP adapter rechecks the bearer credential after reading the request body, so a delayed read cannot use a key revoked or expired during that read.

JSON bodies must arrive within 30 seconds and fit within 3 MiB, including UTF-8 and JSON escaping. A read timeout returns 408; aborted requests return 400. Configure matching or stricter body/connection limits at the proxy.

JavaScript in HTML is disabled by default. An isolated origin and restrictive resource policy protect the app session, but an explicitly enabled demonstration can navigate its own frame and transmit document data. Enable scripts only for trusted content. Original HTML exports must be treated as active content when opened elsewhere.

OpenAPI, discovery, docs and health are public metadata endpoints. API-reference test requests omit browser cookies, do not persist keys and use no third-party transport proxy. Write requests act on the real workspace; they are not a demonstration database.

## Health and failure handling

```sh
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 db
curl --fail --max-time 5 http://localhost:3210/api/health
```

Health reports database connectivity only. A healthy container does not prove complete authorization, usability or security. Check `APP_URL` for origin failures. On a migration error, timeout or resource stop, investigate the bounded logs instead of raising memory limits or retrying automatically.

The startup script removes its temporary builder. A failed startup removes containers newly created during that invocation; it preserves preexisting container IDs and never deletes volumes. An upgrade can already have replaced an earlier container before failing, so restoring the prior image may still be necessary. Run only one operator's startup at a time. If Docker cleanup itself fails, inspect task-created resources manually before retrying; do not stop unrelated containers.

`docker compose down` stops the installation and preserves the data volume. `docker compose down --volumes` deletes all Planroom data and is appropriate only for an intentional disposable-environment reset.

## Backup

Immutable revisions protect against content mistakes; they do not protect against loss of the database or host. Back up users, documents, history, comments and migration state. From the repository root, in a POSIX shell:

```sh
umask 077
set -C
mkdir -p backups
backup="backups/planroom-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U planroom -d planroom -Fc > "$backup.partial" && mv -n "$backup.partial" "$backup"
```

Only a successful dump is promoted to a completed backup. The no-clobber setting and rename protect existing files if a timestamp is reused. Do not treat a remaining `.partial` file as usable. Do not overwrite your last known-good backup. Validate restoration in an isolated environment, then copy successful backups to separate protected storage with a retention policy. Backup directories and database dumps are excluded from Git and Docker context.

Securely retain the configuration and exact Git/image versions separately. Backups contain planning content, authentication hashes, sessions and API-key hashes; protect them as sensitive data. Encryption and access control depend on your storage environment.

## Restore

First test the backup in an isolated installation. The following **replaces the current database contents** and must be used only for an intentional recovery. Stop app writes and select a verified backup:

```sh
docker compose stop app
docker compose exec -T db pg_restore -U planroom -d planroom --clean --if-exists --single-transaction --exit-on-error < backups/verified-backup.dump
docker compose up -d app
```

Use the app version associated with the backup, or a later version with applicable migrations. Check health, login, documents and revision history afterwards. Restored sessions and keys reflect the backup time; if credentials may have been compromised, revoke them and rotate relevant credentials before restoring shared access. Planroom currently has no operator-facing account-recovery CLI.

## Upgrade and rollback

Take a tested backup and preserve the previous app image before upgrading. Select the reviewed source version, then use the bounded startup script or your deployment system. Do not edit an already-applied migration. Startup validates migration checksums and applies only new versions.

If an upgrade fails, first preserve the current database so later changes can be recovered. Revert the app image when the schema remains compatible. If a schema change prevents rollback, restore the previous app version and verified backup together. Do not improvise untested reverse migrations.

Official Node/PostgreSQL base images and GitHub Actions are pinned to verified digests/commit SHAs. npm uses its committed lockfile. Weekly Dependabot pull requests cover npm, Docker, Compose and Actions; review them and keep the PostgreSQL image consistent across Compose, CI and the disposable test script. Never use automatic force-downgrades to silence an audit.

## API reference dependency pin

The bundled Scalar reference is client-only; fonts, telemetry, hosted agents and proxy services are disabled. Its transitive dependencies pin older Undici and AI SDK provider utilities. `package.json` selects patched Undici 7.30.0 and `@ai-sdk/provider-utils` 4.0.33 within their existing major lines. Both support Node.js 22. The provider utilities update addresses [GHSA-866g-f22w-33x8](https://github.com/advisories/GHSA-866g-f22w-33x8).

The reference integration owns these overrides. Remove each when Scalar's selected dependency tree resolves a patched version without it, after checking the complete npm audit and reference transport tests. CI fails on advisories of any reported severity, including development dependencies. No automatic `audit --force` downgrade is used.
