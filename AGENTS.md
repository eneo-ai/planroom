# Planroom

Read docs/ARCHITECTURE.md and src/contracts.ts before changing behavior.
HTML and revisioned instructions have one canonical owner: src/server/documents.ts.
HTTP and MCP are thin adapters over that owner. Preserve the full original HTML.
No any, ts-ignore, duplicate persistence paths, or unrelated compatibility scaffolding.
All user-supplied HTML is untrusted content; never render it in the application's DOM.

## UI ownership: Astryx

Astryx is the canonical component library and design system for this project.
Reuse its existing components, interaction behavior, accessibility and semantic
theme tokens wherever they support the feature. This choice reduces custom UI
code and keeps maintenance aligned with the rest of the eneo-ai projects.

Before adding or replacing UI, inspect similar usage in this repository and
look up the installed component API with npm run astryx. Extend the existing
composition before introducing a new shared wrapper or custom control.
Do not build replacement buttons, fields, selectors, tabs, dialogs, cards,
alerts or navigation when Astryx provides the required behavior. Do not
override its focus indicators, internal control styling or theme colors.

Custom code is limited to product composition and behavior that the library
does not provide, such as the isolated HTML iframe. Native semantic markup
and file inputs are allowed where appropriate. If an Astryx component cannot
meet a requirement, record the concrete limitation and the smallest exception
in the change description. Recheck that exception when upgrading Astryx.

Read AGENTS.local.md when present for stricter host-specific resource commands.
Every heavy install, test, lint, typecheck or build must follow the host's
resource policy and supplied supervisor; never bypass its lock or limits.
Use a bounded deadline, one expensive job at a time and one test/build worker.
On a timeout or memory stop, investigate rather than retrying automatically.
Do not start servers, full builds, browser/E2E tests or full suites without explicit user authorization.
The lead agent coordinates all guarded execution; other agents must not start heavy jobs.
