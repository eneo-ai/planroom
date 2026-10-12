import {
  applyCanvasOperations,
  CanvasOperationError,
  type Canvas,
} from "../canvas";
import type { CanvasUpdate, DocumentCanvas } from "../contracts";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import type {
  Comment,
  DocumentContent,
  DocumentCreate,
  TeamRole,
  DocumentDetail,
  DocumentGitHubLinksUpdate,
  DocumentGitHubLinks,
  RestoreInput,
  DocumentStatus,
  DocumentStatusUpdate,
  DocumentSummary,
  DocumentUpdate,
  RevisionDetail,
  RevisionSummary,
  User,
  PlanningFile,
  PlanningFileSummary,
} from "../contracts";
import {
  canEditDocumentContent,
  documentStatusLabels,
  documentCursorSchema,
} from "../contracts";
import {
  assertReady,
  assertWrite,
  lockWritePrincipal,
  effectiveTeamRole,
  teamAccessParameters,
  teamAccessPredicate,
  type Principal,
} from "./auth";
import { lockProjectAccess } from "./projects";
import { db, transaction } from "./db";
import { AppError, notFound } from "./errors";

interface RevisionRow {
  id: string;
  document_id: string;
  number: number;
  title: string;
  description: string;
  files: PlanningFile[];
  canvas: Canvas | null;
  instructions: string;
  status: DocumentStatus;
  github_links: string[];
  change_summary: string;
  author_name: string;
  created_at: Date;
}
interface DocumentRow extends Omit<RevisionRow, "created_at"> {
  project_id: string;
  project_name: string;
  team_id: string;
  team_name: string;
  role: TeamRole | null;
  cursor_time: string;
  version: number;
  github_links_version: number;
  document_created_at: Date;
  updated_at: Date;
}
type SummaryRow = Pick<
  DocumentRow,
  | "document_id"
  | "title"
  | "description"
  | "status"
  | "github_links"
  | "version"
  | "github_links_version"
  | "number"
  | "author_name"
  | "document_created_at"
  | "updated_at"
  | "project_id"
  | "project_name"
  | "team_id"
  | "team_name"
  | "role"
  | "cursor_time"
> & { files: PlanningFileSummary[] };
type RevisionSummaryRow = Pick<
  RevisionRow,
  "id" | "number" | "title" | "change_summary" | "author_name" | "created_at"
>;
const placementJoin = `JOIN projects p ON p.id=d.project_id JOIN teams t ON t.id=p.team_id LEFT JOIN team_memberships m ON m.team_id=t.id AND m.user_id=$1`;
const placementSelect = `d.project_id,p.name AS project_name,t.id AS team_id,t.name AS team_name,m.role`;
// PostgreSQL timestamps include microseconds. Preserve them in pagination;
// Date.toISOString truncates them and could skip tasks sharing a millisecond.
const cursorTimeSelect = `to_char(d.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time`;
const currentSelect = `SELECT r.id,r.document_id,r.number,r.files,r.canvas,d.title,d.description,d.instructions,d.status,d.change_summary,d.version,d.github_links,d.github_links_version,${placementSelect},${cursorTimeSelect},u.name AS author_name,d.created_at AS document_created_at,d.updated_at FROM documents d ${placementJoin} JOIN document_revisions r ON r.document_id=d.id AND r.number=d.current_revision JOIN users u ON u.id=d.author_id`;
const summarySelect = `SELECT (SELECT jsonb_agg(file - 'content' ORDER BY ordinal) FROM jsonb_array_elements(r.files) WITH ORDINALITY AS entries(file, ordinal)) AS files,d.id AS document_id,d.current_revision AS number,d.title,d.description,d.status,d.version,d.github_links,d.github_links_version,${placementSelect},${cursorTimeSelect},u.name AS author_name,d.created_at AS document_created_at,d.updated_at FROM documents d ${placementJoin} JOIN document_revisions r ON r.document_id=d.id AND r.number=d.current_revision JOIN users u ON u.id=d.author_id`;
function summary(row: SummaryRow, principal: Principal): DocumentSummary {
  return {
    id: row.document_id,
    projectId: row.project_id,
    projectName: row.project_name,
    teamId: row.team_id,
    teamName: row.team_name,
    role: effectiveTeamRole(principal, row.role),
    title: row.title,
    description: row.description,
    status: row.status,
    githubLinks: row.github_links,
    files: row.files.map(({ id, name, format }) => ({ id, name, format })),
    githubLinksVersion: row.github_links_version,
    version: row.version,
    currentRevision: row.number,
    authorName: row.author_name,
    createdAt: row.document_created_at.toISOString(),
    updatedAt: row.cursor_time,
  };
}
function detail(row: DocumentRow, principal: Principal): DocumentDetail {
  return {
    ...summary(row, principal),
    files: row.files,
    instructions: row.instructions,
    changeSummary: row.change_summary,
    canvas: row.canvas,
  };
}
function revisionSummary(row: RevisionSummaryRow): RevisionSummary {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    changeSummary: row.change_summary,
    authorName: row.author_name,
    createdAt: row.created_at.toISOString(),
  };
}
function revisionDetail(row: RevisionRow): RevisionDetail {
  return {
    ...revisionSummary(row),
    description: row.description,
    files: row.files,
    instructions: row.instructions,
    status: row.status,
    githubLinks: row.github_links,
    canvas: row.canvas,
  };
}
async function fetchDocument(
  client: Pick<PoolClient, "query">,
  id: string,
  principal: Principal,
): Promise<DocumentDetail> {
  const result = await client.query<DocumentRow>(
    `${currentSelect} WHERE ${teamAccessPredicate} AND d.id=$4`,
    [...teamAccessParameters(principal), id],
  );
  return result.rows[0] ? detail(result.rows[0], principal) : notFound();
}
/** Check placement without loading original sources for metadata/discussion. */
async function documentProjectId(
  client: Pick<PoolClient, "query">,
  principal: Principal,
  id: string,
): Promise<string> {
  const row = (
    await client.query<{ project_id: string }>(
      `SELECT d.project_id FROM documents d ${placementJoin} WHERE ${teamAccessPredicate} AND d.id=$4`,
      [...teamAccessParameters(principal), id],
    )
  ).rows[0];
  return row ? row.project_id : notFound();
}
function parseDocumentCursor(
  cursor?: string,
): { updatedAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  if (cursor.length <= 200) {
    try {
      return documentCursorSchema.parse(JSON.parse(cursor));
    } catch {
      /* handled below */
    }
  }
  throw new AppError(400, "VALIDATION_ERROR", "Ogiltig sidmarkör.");
}
export async function listDocuments(
  principal: Principal,
  filters: {
    q?: string;
    status?: DocumentStatus;
    projectId?: string;
    teamId?: string;
    cursor?: string;
  } = {},
): Promise<DocumentSummary[]> {
  assertReady(principal);
  const cursor = parseDocumentCursor(filters.cursor);
  const result = await db.query<SummaryRow>(
    `${summarySelect} WHERE ${teamAccessPredicate} AND ($4::text IS NULL OR d.title ILIKE '%' || $4 || '%' OR d.description ILIKE '%' || $4 || '%') AND ($5::text IS NULL OR d.status=$5) AND ($6::uuid IS NULL OR p.id=$6) AND ($7::uuid IS NULL OR t.id=$7) AND ($8::timestamptz IS NULL OR (d.updated_at,d.id) < ($8::timestamptz,$9::uuid)) ORDER BY d.updated_at DESC,d.id DESC LIMIT 100`,
    [
      ...teamAccessParameters(principal),
      filters.q ?? null,
      filters.status ?? null,
      filters.projectId ?? null,
      filters.teamId ?? null,
      cursor?.updatedAt ?? null,
      cursor?.id ?? null,
    ],
  );
  return result.rows.map((row) => summary(row, principal));
}
export function nextDocumentCursor(
  documents: Pick<DocumentSummary, "id" | "updatedAt">[],
): string | null {
  const last = documents.at(-1);
  return documents.length === 100 && last
    ? JSON.stringify({ updatedAt: last.updatedAt, id: last.id })
    : null;
}
export async function getDocument(
  principal: Principal,
  id: string,
): Promise<DocumentDetail> {
  assertReady(principal);
  return fetchDocument(db, id, principal);
}
async function insertRevision(
  client: PoolClient,
  author: User,
  id: string,
  number: number,
  content: DocumentContent,
  githubLinks: string[],
  canvas: Canvas | null,
): Promise<void> {
  await client.query(
    "INSERT INTO document_revisions(id,document_id,number,title,description,files,instructions,status,change_summary,author_id,github_links,canvas) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb)",
    [
      randomUUID(),
      id,
      number,
      content.title,
      content.description,
      JSON.stringify(content.files),
      content.instructions,
      content.status,
      content.changeSummary,
      author.id,
      githubLinks,
      canvas === null ? null : JSON.stringify(canvas),
    ],
  );
}
export async function createDocument(
  principal: Principal,
  content: DocumentCreate,
): Promise<DocumentDetail> {
  assertWrite(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await lockProjectAccess(client, verified, content.projectId);
    const id = await createDocumentInTransaction(
      client,
      verified.user,
      content,
    );
    return fetchDocument(client, id, verified);
  });
}
/** Used by the one-time bootstrap in its existing database transaction. */
export async function createDocumentInTransaction(
  client: PoolClient,
  author: User,
  content: DocumentCreate,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    "INSERT INTO documents(id,current_revision,title,description,instructions,status,change_summary,author_id,project_id) VALUES($1,1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      content.title,
      content.description,
      content.instructions,
      content.status,
      content.changeSummary,
      author.id,
      content.projectId,
    ],
  );
  await insertRevision(client, author, id, 1, content, [], null);
  return id;
}
async function lockDocument(
  client: PoolClient,
  id: string,
  expectedVersion: number,
): Promise<void> {
  const result = await client.query<{ version: number }>(
    "SELECT version FROM documents WHERE id=$1 FOR UPDATE",
    [id],
  );
  const row = result.rows[0];
  if (!row) notFound();
  if (row.version !== expectedVersion)
    throw new AppError(
      409,
      "DOCUMENT_CONFLICT",
      "Planeringen har uppdaterats. Läs den senaste planeringen innan du sparar.",
      undefined,
      row.version,
    );
}

async function writeDocument(
  principal: Principal,
  id: string,
  expectedVersion: number,
  change: (
    current: DocumentDetail,
    client: PoolClient,
  ) => Promise<DocumentContent & { canvas: Canvas | null }>,
): Promise<DocumentDetail> {
  assertWrite(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await lockProjectAccess(
      client,
      verified,
      await documentProjectId(client, verified, id),
    );
    await lockDocument(client, id, expectedVersion);
    const current = await fetchDocument(client, id, verified);
    const content = await change(current, client);
    const filesChanged =
      content.files.length !== current.files.length ||
      content.files.some((file, index) => {
        const previous = current.files[index];
        return (
          file.id !== previous.id ||
          file.name !== previous.name ||
          file.format !== previous.format ||
          file.content !== previous.content
        );
      });
    // JSONB reorders object keys; key order must not manufacture revisions.
    const canvasChanged = !isDeepStrictEqual(content.canvas, current.canvas);
    const contentChanged = filesChanged || canvasChanged;
    const metadataChanged =
      content.title !== current.title ||
      content.description !== current.description ||
      content.instructions !== current.instructions ||
      content.status !== current.status;
    // An identical save is not a new edit, even if its summary differs.
    if (!contentChanged && !metadataChanged) return current;
    const number = current.currentRevision + (contentChanged ? 1 : 0);
    if (contentChanged)
      await insertRevision(
        client,
        verified.user,
        id,
        number,
        content,
        current.githubLinks,
        content.canvas,
      );
    await client.query(
      "UPDATE documents SET current_revision=$2,title=$3,description=$4,instructions=$5,status=$6,change_summary=$7,author_id=$8,version=version+1,updated_at=now() WHERE id=$1",
      [
        id,
        number,
        content.title,
        content.description,
        content.instructions,
        content.status,
        content.changeSummary,
        verified.user.id,
      ],
    );
    return fetchDocument(client, id, verified);
  });
}

function assertContentEditable(current: DocumentDetail): void {
  if (!canEditDocumentContent(current.status))
    throw new AppError(
      409,
      "DOCUMENT_LOCKED",
      "Planeringen är låst. Byt först status till Utkast eller Aktiv planering för att ändra innehållet.",
      current.currentRevision,
    );
}

export async function updateDocument(
  principal: Principal,
  id: string,
  content: DocumentUpdate,
): Promise<DocumentDetail> {
  return writeDocument(
    principal,
    id,
    content.expectedVersion,
    async (current) => {
      assertContentEditable(current);
      return { ...content, canvas: current.canvas };
    },
  );
}

export async function updateDocumentStatus(
  principal: Principal,
  id: string,
  input: DocumentStatusUpdate,
): Promise<DocumentSummary> {
  assertWrite(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await lockProjectAccess(
      client,
      verified,
      await documentProjectId(client, verified, id),
    );
    await lockDocument(client, id, input.expectedVersion);
    const result = await client.query<SummaryRow>(
      `${summarySelect} WHERE ${teamAccessPredicate} AND d.id=$4`,
      [...teamAccessParameters(verified), id],
    );
    const current = summary(result.rows[0], verified);
    if (current.status === input.status) return current;
    await client.query(
      "UPDATE documents SET status=$2,change_summary=$3,author_id=$4,version=version+1,updated_at=now() WHERE id=$1",
      [
        id,
        input.status,
        `Status: ${documentStatusLabels[current.status]} → ${documentStatusLabels[input.status]}`,
        verified.user.id,
      ],
    );
    const next = await client.query<SummaryRow>(
      `${summarySelect} WHERE ${teamAccessPredicate} AND d.id=$4`,
      [...teamAccessParameters(verified), id],
    );
    return summary(next.rows[0], verified);
  });
}

interface GitHubLinksRow {
  github_links: string[];
  github_links_version: number;
}
function linksDetail(row: GitHubLinksRow): DocumentGitHubLinks {
  return {
    githubLinks: row.github_links,
    githubLinksVersion: row.github_links_version,
  };
}
export async function getDocumentGitHubLinks(
  principal: Principal,
  id: string,
): Promise<DocumentGitHubLinks> {
  assertReady(principal);
  const result = await db.query<GitHubLinksRow>(
    `SELECT d.github_links,d.github_links_version FROM documents d ${placementJoin} WHERE ${teamAccessPredicate} AND d.id=$4`,
    [...teamAccessParameters(principal), id],
  );
  return result.rows[0] ? linksDetail(result.rows[0]) : notFound();
}
export async function updateDocumentGitHubLinks(
  principal: Principal,
  id: string,
  input: DocumentGitHubLinksUpdate,
): Promise<DocumentGitHubLinks> {
  assertWrite(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await lockProjectAccess(
      client,
      verified,
      await documentProjectId(client, verified, id),
    );
    const result = await client.query<GitHubLinksRow>(
      "SELECT github_links,github_links_version FROM documents WHERE id=$1 FOR UPDATE",
      [id],
    );
    const current = result.rows[0];
    if (!current) notFound();
    if (current.github_links_version !== input.expectedLinksVersion)
      throw new AppError(
        409,
        "GITHUB_LINKS_CONFLICT",
        "GitHub-kopplingarna har ändrats. Hämta de senaste kopplingarna och försök igen.",
      );
    if (
      current.github_links.length === input.githubLinks.length &&
      current.github_links.every(
        (url, index) => url === input.githubLinks[index],
      )
    )
      return linksDetail(current);
    const next = await client.query<GitHubLinksRow>(
      "UPDATE documents SET github_links=$2,github_links_version=github_links_version+1 WHERE id=$1 RETURNING github_links,github_links_version",
      [id, input.githubLinks],
    );
    return linksDetail(next.rows[0]);
  });
}
export async function listRevisions(
  principal: Principal,
  id: string,
): Promise<RevisionSummary[]> {
  assertReady(principal);
  await documentProjectId(db, principal, id);
  const result = await db.query<RevisionSummaryRow>(
    `SELECT r.id,r.number,r.title,r.change_summary,r.created_at,u.name AS author_name FROM document_revisions r JOIN documents d ON d.id=r.document_id ${placementJoin} JOIN users u ON u.id=r.author_id WHERE ${teamAccessPredicate} AND d.id=$4 ORDER BY number DESC`,
    [...teamAccessParameters(principal), id],
  );
  return result.rows.map(revisionSummary);
}
export async function getRevision(
  principal: Principal,
  id: string,
  number: number,
): Promise<RevisionDetail> {
  assertReady(principal);
  const result = await db.query<RevisionRow>(
    `SELECT r.*,u.name AS author_name FROM document_revisions r JOIN documents d ON d.id=r.document_id ${placementJoin} JOIN users u ON u.id=r.author_id WHERE ${teamAccessPredicate} AND d.id=$4 AND r.number=$5`,
    [...teamAccessParameters(principal), id, number],
  );
  return result.rows[0] ? revisionDetail(result.rows[0]) : notFound();
}
export async function restoreDocument(
  principal: Principal,
  id: string,
  number: number,
  input: RestoreInput,
): Promise<DocumentDetail> {
  return writeDocument(
    principal,
    id,
    input.expectedVersion,
    async (current, client) => {
      assertContentEditable(current);
      const source = (
        await client.query<RevisionRow>(
          "SELECT * FROM document_revisions WHERE document_id=$1 AND number=$2",
          [id, number],
        )
      ).rows[0];
      if (!source) notFound();
      return {
        title: source.title,
        description: source.description,
        files: source.files,
        canvas: source.canvas,
        instructions: source.instructions,
        status: source.status,
        changeSummary: input.changeSummary,
      };
    },
  );
}
interface CommentRow {
  id: string;
  body: string;
  section_id: string | null;
  author_name: string;
  created_at: Date;
}
function comment(row: CommentRow): Comment {
  return {
    id: row.id,
    body: row.body,
    sectionId: row.section_id,
    authorName: row.author_name,
    createdAt: row.created_at.toISOString(),
  };
}
export async function listComments(
  principal: Principal,
  id: string,
): Promise<Comment[]> {
  await documentProjectId(db, principal, id);
  const result = await db.query<CommentRow>(
    `SELECT c.*,u.name AS author_name FROM comments c JOIN documents d ON d.id=c.document_id ${placementJoin} JOIN users u ON u.id=c.author_id WHERE ${teamAccessPredicate} AND d.id=$4 ORDER BY c.created_at`,
    [...teamAccessParameters(principal), id],
  );
  return result.rows.map(comment);
}
export async function addComment(
  principal: Principal,
  id: string,
  input: { body: string; sectionId?: string | null },
): Promise<Comment> {
  assertWrite(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await lockProjectAccess(
      client,
      verified,
      await documentProjectId(client, verified, id),
    );
    const result = await client.query<CommentRow>(
      "WITH c AS (INSERT INTO comments(id,document_id,author_id,body,section_id) VALUES($1,$2,$3,$4,$5) RETURNING *) SELECT c.*,u.name AS author_name FROM c JOIN users u ON u.id=c.author_id",
      [randomUUID(), id, verified.user.id, input.body, input.sectionId ?? null],
    );
    return comment(result.rows[0]);
  });
}

function canvasDetail(document: DocumentDetail): DocumentCanvas {
  return {
    documentId: document.id,
    version: document.version,
    currentRevision: document.currentRevision,
    status: document.status,
    canvas: document.canvas,
  };
}
export async function getDocumentCanvas(
  principal: Principal,
  id: string,
): Promise<DocumentCanvas> {
  assertReady(principal);
  const result = await db.query<{
    version: number;
    current_revision: number;
    status: DocumentStatus;
    canvas: Canvas | null;
  }>(
    `SELECT d.version,d.current_revision,d.status,r.canvas FROM documents d ${placementJoin} JOIN document_revisions r ON r.document_id=d.id AND r.number=d.current_revision WHERE ${teamAccessPredicate} AND d.id=$4`,
    [...teamAccessParameters(principal), id],
  );
  const row = result.rows[0];
  if (!row) notFound();
  return {
    documentId: id,
    version: row.version,
    currentRevision: row.current_revision,
    status: row.status,
    canvas: row.canvas,
  };
}
export async function updateDocumentCanvas(
  principal: Principal,
  id: string,
  input: CanvasUpdate,
): Promise<DocumentCanvas> {
  const updated = await writeDocument(
    principal,
    id,
    input.expectedVersion,
    async (current) => {
      assertContentEditable(current);
      try {
        return {
          ...current,
          changeSummary: input.changeSummary,
          canvas: applyCanvasOperations(
            current.canvas,
            current.title,
            input.operations,
          ),
        };
      } catch (error) {
        if (error instanceof CanvasOperationError)
          throw new AppError(400, "INVALID_CANVAS_OPERATION", error.message);
        throw error;
      }
    },
  );
  return canvasDetail(updated);
}
