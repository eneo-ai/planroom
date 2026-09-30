# Planroom

Read docs/ARCHITECTURE.md and src/contracts.ts before changing behavior.
HTML and revisioned instructions have one canonical owner: src/server/documents.ts.
HTTP and MCP are thin adapters over that owner. Preserve the full original HTML.
Use Astryx components and tokens. Look up component APIs with npm run astryx.
Use native elements only for HTML viewer, semantic structure, and file inputs where necessary.
No any, ts-ignore, duplicate persistence paths, or unrelated compatibility scaffolding.
All user-supplied HTML is untrusted content; never render it in the application's DOM.

Every local install, test, lint, typecheck, build or other heavy run MUST use:
python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 600 -- <command>
Shorten the deadline for focused checks. One guarded job globally; one worker.
Do not start servers, full builds, browser/E2E tests or full suites without explicit user authorization.
The lead agent coordinates all guarded execution; other agents must not start heavy jobs.
