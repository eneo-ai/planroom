# Planroom

Read docs/ARCHITECTURE.md and src/contracts.ts before changing behavior.
HTML and revisioned instructions have one canonical owner: src/server/documents.ts.
HTTP and MCP are thin adapters over that owner. Preserve the full original HTML.
Use Astryx components and tokens. Look up component APIs with npm run astryx.
Use native elements only for HTML viewer, semantic structure, and file inputs where necessary.
No any, ts-ignore, duplicate persistence paths, or unrelated compatibility scaffolding.
All user-supplied HTML is untrusted content; never render it in the application's DOM.

Read AGENTS.local.md when present for stricter host-specific resource commands.
Every heavy install, test, lint, typecheck or build must follow the host's
resource policy and supplied supervisor; never bypass its lock or limits.
Use a bounded deadline, one expensive job at a time and one test/build worker.
On a timeout or memory stop, investigate rather than retrying automatically.
Do not start servers, full builds, browser/E2E tests or full suites without explicit user authorization.
The lead agent coordinates all guarded execution; other agents must not start heavy jobs.
