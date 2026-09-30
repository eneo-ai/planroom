# Contributing

Planroom is early-stage software. Small, reviewable changes that improve real planning workflows are welcome. For a substantial feature or architecture change, explain the problem and proposed scope before implementing it. Read [AGENTS.md](AGENTS.md), [the architecture](docs/ARCHITECTURE.md) and [the API contract](docs/CONTRACT.md).

## Local setup

Use Node.js 22 and the committed npm lockfile. Runtime requires Docker Compose v2 and PostgreSQL 17. The initial UI is Swedish; preserve its language and accessibility conventions unless the change explicitly introduces localization.

```sh
npm ci
node scripts/configure.mjs
```

Apply your environment's resource supervisor to dependency installation, tests, typechecking and builds. `AGENTS.md` also points to an optional, untracked `AGENTS.local.md` for stricter host-specific commands. Public onboarding does not assume that a particular host tool exists. Run one worker and one expensive job at a time. Do not start servers, full builds or full suites as part of an agent task unless explicitly requested.

The bounded Docker startup script is described in [README.md](README.md). `.env`, local data, private planning files and backups must never enter a contribution. Share a minimal synthetic example instead.

## Checks

Use focused behavior tests while developing:

```sh
npm run typecheck
npm test -- tests/contracts.test.ts tests/configure.test.ts
npm run format:check
```

For explicitly requested PostgreSQL integration validation:

```sh
npm run test:postgres
```

That script creates a randomly named, resource-limited disposable Docker database and removes it afterwards. It does not use the app's persistent database. Tests also support `DATABASE_URL` and `TEST_DATABASE_URL` pointing to the same explicitly disposable database; they truncate its tables. **Never supply production credentials or a database containing work.**

CI runs typechecking, the single-worker tests, a complete dependency audit and a Docker startup smoke check. Record which checks you actually ran and any environmental limits. Passing these checks is not evidence of a complete security audit.

## Ownership and contracts

- `src/server/documents.ts` owns document persistence, revisions and conflict behavior. REST and MCP are adapters over it.
- `src/contracts.ts` owns request and response contracts. `src/server/openapi.ts` publishes the REST operation catalog.
- Authentication and role/scope decisions belong in the server. Client visibility is not authorization.
- Astryx components and tokens own standard controls. Use existing components before creating custom UI.
- Follow the [Astryx ownership policy](AGENTS.md#ui-ownership-astryx). Check the installed API and existing usage first; document any necessary exception and review it on library upgrades.
- HTML preview content is untrusted. Never insert it into the application's DOM or add same-origin permission to its sandbox.

Include behavior tests for changed contracts and failure modes. Prefer typed inputs and explicit lifecycle states. Avoid duplicated owners, unneeded compatibility paths, generic helper layers, `any` and ignored type errors. Keep mechanical moves separate from behavior changes where practical.

## Pull requests

Explain the problem, resulting behavior, owner, tests and any risk or rollback procedure. Include screenshots for visible UI changes when available. Update the README, deployment guide or API contract alongside changes to documented behavior. Never edit an applied migration; add a new migration and test recovery.

Dependency changes require a lockfile update and production audit review. Keep verified Action SHAs and image digests rather than replacing them with floating tags. Image updates must align Compose, CI and test fixtures. No automated merging or production publishing is enabled by the included workflows.

Report security concerns privately following [SECURITY.md](SECURITY.md). Contributions are distributed under the repository's [MIT License](LICENSE); confirm you have permission to contribute code and assets.
