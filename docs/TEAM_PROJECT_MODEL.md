# Team and project model

Status: implemented as the prerequisite for public project sharing. PostgreSQL checks run against the disposable CI database; no user database is migrated by this change.

Planroom supports **team → project → task → files**. A team gives people a shared place to work, a project groups related work, and a task carries its planning material and development handoff. Reuse the existing planning document as the task: it already owns title, description, status, instructions, GitHub references, comments, files and immutable revisions.

This adds useful organization as the installation grows without introducing a second task engine or another document store. Team access is a server authorization change as well as a navigation change; it must ship consistently across the UI, REST, MCP and file export.

## Existing behavior reused by this change

Before this change the application had one shared workspace. Every configured user could read every document; the account role controlled writes and user administration. There was no team, project or membership relation, and document listing returned at most 200 results.

[contracts.ts](../src/contracts.ts) owns typed requests and responses. [documents.ts](../src/server/documents.ts) owns document persistence, immutable revisions, lifecycle rules and comments. [auth.ts](../src/server/auth.ts) owns authentication, credential lifecycle and live write authorization. REST and MCP call those owners. Astryx owns the application controls and navigation.

Each revision contains the existing original HTML/Markdown files and optional typed canvas. Current metadata and independent GitHub-link versions retain their existing owners and concurrency contracts.

## Product structure

| Level   | Responsibility                                                    | Example                       |
| ------- | ----------------------------------------------------------------- | ----------------------------- |
| Team    | Membership, access and team home                                  | Digital services              |
| Project | Goal, description and related tasks                               | Citizen portal                |
| Task    | A concrete piece of work, status, discussion and planning history | Design the application flow   |
| File    | Original supporting material within the task                      | flow.html and requirements.md |

The team's area is its home page and project collection. It does not need a separate workspace entity with its own identity and permissions. A user can belong to several teams. Each project belongs to exactly one team, and each task belongs to exactly one project.

Keep stable UUIDs. A title or renamed team must not change task links. Keep existing `/documents/:id` links and the document API names in the first implementation; the UI can call them tasks within projects. A later terminology change should be a separate mechanical change with a deliberate API version decision.

The first release preserves the existing requirement for at least one planning file. Plain tasks with no files would be a separate explicit contract change. It does not infer completion from Markdown checkboxes or HTML controls: the task's current status remains authoritative.

## Canonical owners

| Concept                                           | Canonical owner                              | Change                                                                              |
| ------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Identity, credentials and platform administration | src/server/auth.ts                           | Reuse credential checks; own global administration and canonical team authorization |
| Teams and membership lifecycle                    | src/server/teams.ts                          | Own teams, membership changes and last-owner protection                             |
| Projects and their team relationship              | src/server/projects.ts                       | Own projects; delegate membership checks to auth.ts                                 |
| Tasks, files, comments, lifecycle and revisions   | src/server/documents.ts                      | Extend the existing owner with required project placement and team authorization    |
| Request and response contracts                    | src/contracts.ts                             | Extend existing executable schemas                                                  |
| REST, OpenAPI and MCP                             | Existing adapters                            | Expose the same operations and permissions through existing owners                  |
| Team and project navigation                       | Existing application composition with Astryx | Reuse installed navigation, fields, cards, selectors, dialogs and feedback          |

Do not make teams and projects alternate writers of documents or file collections. A project page lists tasks through documents.ts. Task history is still one immutable revision stream. Authorization belongs to auth.ts; documents.ts applies it to every task operation, including direct access by UUID.

## Database relationships

Use relational tables for `teams`, `team_memberships` and `projects`. `documents` has a required `project_id` foreign key. Keep revisioned planning content in `document_revisions` and comments in the existing table.

`team_memberships` has a unique `(team_id, user_id)` key and a typed team role. `projects.team_id` and `documents.project_id` are required foreign keys with indexes for authorized listing. Resolve a task's team through its project; do not persist a second team assignment on the task or each revision that could disagree with the parent.

Store team and project names and descriptions on their owners. Changing a project description must not rewrite every task revision. Protect team and project metadata updates from lost changes with an explicit version precondition. The existing expectedVersion contract protects task/content changes; expectedLinksVersion protects GitHub references independently. Content revisions remain reserved for changed files or canvas.

The first release does not support moving a project between teams, moving a task between projects or deleting a team/project containing work. Those actions alter visibility or retention and need their own reviewed behavior. Reject unsupported operations explicitly rather than exposing a generic parent update. Renaming stays within the current parent and preserves IDs.

## Membership and access

Team roles are **owner**, **editor** and **viewer**. Owners manage the team, memberships and projects; editors manage projects and tasks; viewers read. Keep the existing rule that discussion writes require an editor or owner. Require at least one owner per team; reject removing or demoting the last owner.

Globaladmin controls accounts and team creation and has explicit access to every team and its content. Ordinary users need membership. The interface identifies globaladmin oversight; team privacy does not exclude administrators or database operators. Platform roles are global_admin and user; membership roles alone determine an ordinary user's content permissions. A user can edit in one team and read in another.

Projects inherit team membership. The first release has no separate project ACL or per-task ACL. A person who needs different access should use a different team. This keeps one authorization rule and makes access understandable from the interface.

The authorized query must cover task lists and search, direct reads, historical revisions, comments, exports and all writes. A hidden navigation item or client-side project filter does not enforce access. A task outside the caller's memberships returns the same not-found result as an unknown task, without exposing its title, revision number or file metadata.

On each write, revalidate credentials and membership inside the same transaction as the mutation. Establish and test one lock order for credential checks, team/membership changes and task revision changes. If a removal or demotion commits first, a previously authenticated request must not save using its former permissions. Reuse auth.ts's current credential locking instead of creating a separate bearer/session security path.

Membership and role must be checked from persisted state, not cached permanently in a session or MCP server. Revocation must take effect for later requests, including requests from a connected AI client. Membership administration uses authenticated same-origin browser sessions, following existing account-administration boundaries.

## REST and MCP context

Creating a task requires an explicit `projectId`. The server derives the team and verifies project access. Updating task content does not accept a parent change. Lists can filter by project or team, but every query is independently constrained to authorized memberships. Return parent IDs and useful names so both people and AI can identify a task's context.

Add matching list/read operations for teams and projects and a project-creation operation for authorized editors. Keep task reads, writes, status, restoration and comments in their existing adapters. Generate OpenAPI from the same contracts and update MCP instructions to require selecting an authorized project before creating a task. A team or project ID provided by an AI is a parameter, not authorization.

Bind new personal API keys to one selected team and their existing read/write scope. Effective access is the intersection of key scope and the owner's current membership role. A key must not access other teams that its owner later joins. Migrate existing keys to the initial team, where all existing content is placed, and retain expiry, revocation and one-time secret disclosure. Browser sessions can navigate all of the user's memberships.

Task lists replace the global query with authorized 100-result cursor pages, ordered by updatedAt and an ID tie-breaker. Cursors retain PostgreSQL microseconds so tasks within the same millisecond are not skipped. Listings reflect live data rather than a frozen snapshot. Team and project lists are ordered by name and ID; pagination for those smaller collections is not part of this slice.

## Files and future resources

HTML and Markdown remain the supported formats in the first release, with exact source preservation and the current whole-collection revision history. Keep stable file IDs, count/source limits, conflict handling and isolated previews. User-supplied HTML must never enter the application's DOM.

Add another format only when there is an actual product requirement. A format needs an explicit typed contract, size limit, export behavior and supported preview behavior. Unknown formats should not automatically render. Resource content remains untrusted project material, including instructions presented to AI clients.

Images, PDFs and other binary files require a storage decision when introduced. Use immutable stored objects referenced by revisions, with server-controlled authorized downloads; retaining old revisions must retain their referenced objects. Define upload limits, retention, cleanup and backup/restore together. Do not put arbitrary binaries into the current text-source JSON contract or introduce a generic plugin system now.

The current preview blocks external resources. Supporting uploaded images inside HTML would require a deliberate solution for resource URLs, authorization and the opaque iframe sandbox; storing an attachment alone does not make it available to the preview.

## Migration and recovery

Use a new numbered migration after the existing migrations. Never edit an applied migration. Create one initial team and one initial project and place every existing document there. Backfill every existing user as a member, mapping current admin accounts to team owners, editors to editors and viewers to viewers. Preserve the former admin accounts' platform-administration capability separately.

Existing HTML/Markdown sources, file identities, revisions, comments, statuses, GitHub links and document URLs stay intact. Existing tokens are bound to the initial team. New accounts do not automatically join this team or receive access to all historical work; their memberships are assigned explicitly.

Fresh-install bootstrap must create the same valid structure and place the optional example in its initial project through the canonical owners. It must also work when migrations run before the initial user exists. A renamed bootstrap account remains the same member by UUID. Test both existing-data migration and fresh installation, including a database with no users or documents.

Back up the database and retain the current application image before deployment. An older application has global document reads and cannot enforce the new team boundary. Once private teams contain data, do not roll back to that image against the upgraded database. Recovery needs a compatible application or the matching database backup, with explicit handling of work created since that backup. Revision history alone is not a backup.

No migration has been applied to a running database during this implementation.

## Implementation scope

This implementation slice contains the relational model and migration, membership authorization, team/project creation and listing, project-scoped task creation and navigation, matching REST/MCP contracts, and behavior tests. Authorization must cover every existing task route before the feature is enabled. Schema and server work can be reviewed separately from UI composition, but an incomplete access boundary must not ship. Globaladmin reads are an explicit authorized exception to member-only access.

Reuse document persistence, content revisioning, status freezes, restore, comments, file import/export and preview isolation. Replace the global list and global content role assumptions with membership-aware access. Keep platform credential behavior, password rules, key lifetime and the existing planning lifecycle. Public read links are described in ARCHITECTURE.md and CONTRACT.md. Introduce no organization layer, invitations, SSO, boards, subtasks, assignees, GitHub synchronization or additional formats in this slice.

Look up the installed Astryx APIs with `npm run astryx` before changing UI. Extend the existing compositions and record any concrete component limitation. Protect unsaved drafts when changing team/project context and preserve their selected project; no silent reassignment when navigating or retrying a save.

## Acceptance criteria and validation

1. A user in two teams can have different roles and sees the correct projects and tasks in each.
2. Ordinary users in team A cannot read or modify team B's tasks through listings, search, direct URLs, revisions, comments, export, REST or MCP. Denials do not reveal task metadata or currentRevision. Globaladmin intentionally has access to both.
3. Read keys cannot write. Keys bound to team A cannot access team B even when their owner belongs to both. Removing or demoting a member prevents subsequent writes using an already-issued credential.
4. Concurrent membership removal and task writes follow the declared transaction order. At least one team owner always remains, including during concurrent removals or demotions.
5. Task creation requires an authorized project. Database relationships reject orphaned tasks and projects. Unrecognized parent IDs and unsupported moves do not fall back to the initial project.
6. Migrating existing data preserves original sources, every revision and comment, existing role behavior within the initial team, document IDs/URLs and token expiry. Fresh bootstrap creates a valid team, project and example only once.
7. Existing conflict, restore, freeze/reopen and HTML/Markdown isolation tests still protect the task behavior. Team/project renames preserve task links and reject stale metadata writes.
8. Paging covers more than 200 tasks without exposing an unauthorized team's data or omitting results with tied or microsecond timestamps. Unsaved drafts retain both content and project context across navigation.

Extend the existing contract, OpenAPI and MCP tests. Add focused PostgreSQL integration tests for migration, foreign keys, role combinations, last-owner protection and membership/write races. Test actual authorized behavior rather than only checking mocked query calls. PostgreSQL tests need an explicitly supplied disposable database.

Run local checks only through the host supervisor, one expensive command at a time and one test worker. Implementation checks are:

```sh
python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 180 -- npm run typecheck
python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 180 -- npm test -- tests/contracts.test.ts tests/openapi.test.ts tests/mcp.test.ts
```

Include new focused membership/project tests when those files exist. Format only the changed files through the same supervisor. Do not start a server, production build, full suite or browser/E2E run without explicit authorization for that execution. Completed checks and any pending browser validation are recorded in VALIDATION.md.

## Maintainability result

With this implementation, one task owner continues to control planning behavior. One authorization owner determines team access, and one relational parent chain determines placement. The unrestricted all-documents read path disappears for ordinary users; globaladmin retains explicit oversight. Unauthorized parents, removed memberships, stale metadata, missing projects and last-owner changes become explicit failure cases.

A new engineer can follow a task from its required project to its team, check membership in one owner and then use the existing document operations. That is the intended foundation for adding actual resource types and task features later without duplicating persistence or scattering permissions.
