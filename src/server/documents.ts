import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  Comment,
  DocumentContent,
  DocumentDetail,
  DocumentGitHubLinksUpdate,
  DocumentStatus,
  DocumentStatusUpdate,
  DocumentSummary,
  DocumentUpdate,
  RevisionDetail,
  RevisionSummary,
  User,
} from "../contracts";
import { canEditDocumentContent, documentStatusLabels } from "../contracts";
import {
  assertReady,
  assertWrite,
  lockWritePrincipal,
  type Principal,
} from "./auth";
import { db, transaction } from "./db";
import { AppError, notFound } from "./errors";

interface RevisionRow {
  id: string;
  document_id: string;
  number: number;
  title: string;
  description: string;
  html: string;
  instructions: string;
  status: DocumentStatus;
  github_links: string[];
  change_summary: string;
  author_name: string;
  created_at: Date;
}
interface DocumentRow extends RevisionRow {
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
  | "number"
  | "author_name"
  | "document_created_at"
  | "updated_at"
>;
type RevisionSummaryRow = Pick<
  RevisionRow,
  "id" | "number" | "title" | "change_summary" | "author_name" | "created_at"
>;
const currentSelect = `SELECT r.*, u.name AS author_name, d.created_at AS document_created_at, d.updated_at FROM documents d JOIN document_revisions r ON r.document_id=d.id AND r.number=d.current_revision JOIN users u ON u.id=r.author_id`;
const summarySelect = `SELECT r.document_id,r.number,r.title,r.description,r.status,r.github_links,u.name AS author_name,d.created_at AS document_created_at,d.updated_at FROM documents d JOIN document_revisions r ON r.document_id=d.id AND r.number=d.current_revision JOIN users u ON u.id=r.author_id`;
function summary(row: SummaryRow): DocumentSummary {
  return {
    id: row.document_id,
    title: row.title,
    description: row.description,
    status: row.status,
    githubLinks: row.github_links,
    currentRevision: row.number,
    authorName: row.author_name,
    createdAt: row.document_created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
function detail(row: DocumentRow): DocumentDetail {
  return {
    ...summary(row),
    html: row.html,
    instructions: row.instructions,
    changeSummary: row.change_summary,
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
    html: row.html,
    instructions: row.instructions,
    status: row.status,
    githubLinks: row.github_links,
  };
}
async function fetchDocument(
  client: Pick<PoolClient, "query">,
  id: string,
): Promise<DocumentDetail> {
  const result = await client.query<DocumentRow>(
    `${currentSelect} WHERE d.id=$1`,
    [id],
  );
  return result.rows[0] ? detail(result.rows[0]) : notFound();
}
export async function listDocuments(
  principal: Principal,
  filters: { q?: string; status?: DocumentStatus } = {},
): Promise<DocumentSummary[]> {
  assertReady(principal);
  const result = await db.query<SummaryRow>(
    `${summarySelect} WHERE ($1::text IS NULL OR r.title ILIKE '%' || $1 || '%' OR r.description ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR r.status=$2) ORDER BY d.updated_at DESC LIMIT 200`,
    [filters.q ?? null, filters.status ?? null],
  );
  return result.rows.map(summary);
}
export async function getDocument(
  principal: Principal,
  id: string,
): Promise<DocumentDetail> {
  assertReady(principal);
  return fetchDocument(db, id);
}
async function insertRevision(
  client: PoolClient,
  author: User,
  id: string,
  number: number,
  content: DocumentContent & Pick<DocumentDetail, "githubLinks">,
): Promise<void> {
  await client.query(
    "INSERT INTO document_revisions(id,document_id,number,title,description,html,instructions,status,change_summary,author_id,github_links) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [
      randomUUID(),
      id,
      number,
      content.title,
      content.description,
      content.html,
      content.instructions,
      content.status,
      content.changeSummary,
      author.id,
      content.githubLinks,
    ],
  );
}
export async function createDocument(
  principal: Principal,
  content: DocumentContent,
): Promise<DocumentDetail> {
  assertWrite(principal);
  return transaction(async (client) =>
    createDocumentInTransaction(
      client,
      (await lockWritePrincipal(client, principal)).user,
      content,
    ),
  );
}
/** Used by the one-time bootstrap in its existing database transaction. */
export async function createDocumentInTransaction(
  client: PoolClient,
  author: User,
  content: DocumentContent,
): Promise<DocumentDetail> {
  const id = randomUUID();
  await client.query(
    "INSERT INTO documents(id,current_revision) VALUES($1,1)",
    [id],
  );
  await insertRevision(client, author, id, 1, { ...content, githubLinks: [] });
  return fetchDocument(client, id);
}
async function lockRevision(
  client: PoolClient,
  id: string,
  expectedRevision: number,
): Promise<number> {
  const result = await client.query<{ current_revision: number }>(
    "SELECT current_revision FROM documents WHERE id=$1 FOR UPDATE",
    [id],
  );
  const row = result.rows[0];
  if (!row) notFound();
  if (row.current_revision !== expectedRevision)
    throw new AppError(
      409,
      "REVISION_CONFLICT",
      "Planeringen har uppdaterats. Läs den nya versionen innan du sparar.",
      row.current_revision,
    );
  return row.current_revision + 1;
}
async function advance(
  client: PoolClient,
  id: string,
  number: number,
): Promise<DocumentDetail> {
  await client.query(
    "UPDATE documents SET current_revision=$2,updated_at=now() WHERE id=$1",
    [id, number],
  );
  return fetchDocument(client, id);
}
async function writeRevision(
  principal: Principal,
  id: string,
  expectedRevision: number,
  change: (
    current: DocumentDetail,
    client: PoolClient,
  ) => Promise<DocumentContent & Pick<DocumentDetail, "githubLinks">>,
): Promise<DocumentDetail> {
  assertWrite(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    const next = await lockRevision(client, id, expectedRevision);
    const current = await fetchDocument(client, id);
    const content = await change(current, client);
    await insertRevision(client, verified.user, id, next, content);
    return advance(client, id, next);
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
  return writeRevision(
    principal,
    id,
    content.expectedRevision,
    async (current) => {
      assertContentEditable(current);
      return { ...content, githubLinks: current.githubLinks };
    },
  );
}

export async function updateDocumentStatus(
  principal: Principal,
  id: string,
  input: DocumentStatusUpdate,
): Promise<DocumentDetail> {
  return writeRevision(
    principal,
    id,
    input.expectedRevision,
    async (current) => ({
      ...current,
      status: input.status,
      changeSummary: `Status: ${documentStatusLabels[current.status]} → ${documentStatusLabels[input.status]}`,
    }),
  );
}

export async function updateDocumentGitHubLinks(
  principal: Principal,
  id: string,
  input: DocumentGitHubLinksUpdate,
): Promise<DocumentDetail> {
  return writeRevision(
    principal,
    id,
    input.expectedRevision,
    async (current) => ({
      ...current,
      githubLinks: input.githubLinks,
      changeSummary: "Uppdaterar GitHub-kopplingar",
    }),
  );
}
export async function listRevisions(
  principal: Principal,
  id: string,
): Promise<RevisionSummary[]> {
  assertReady(principal);
  if (!(await db.query("SELECT id FROM documents WHERE id=$1", [id])).rows[0])
    notFound();
  const result = await db.query<RevisionSummaryRow>(
    "SELECT r.id,r.number,r.title,r.change_summary,r.created_at,u.name AS author_name FROM document_revisions r JOIN users u ON u.id=r.author_id WHERE document_id=$1 ORDER BY number DESC",
    [id],
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
    "SELECT r.*,u.name AS author_name FROM document_revisions r JOIN users u ON u.id=r.author_id WHERE document_id=$1 AND number=$2",
    [id, number],
  );
  return result.rows[0] ? revisionDetail(result.rows[0]) : notFound();
}
export async function restoreDocument(
  principal: Principal,
  id: string,
  number: number,
  input: { expectedRevision: number; changeSummary: string },
): Promise<DocumentDetail> {
  return writeRevision(
    principal,
    id,
    input.expectedRevision,
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
        html: source.html,
        instructions: source.instructions,
        status: source.status,
        githubLinks: source.github_links,
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
  await getDocument(principal, id);
  const result = await db.query<CommentRow>(
    "SELECT c.*,u.name AS author_name FROM comments c JOIN users u ON u.id=c.author_id WHERE document_id=$1 ORDER BY created_at",
    [id],
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
    if (
      !(await client.query("SELECT id FROM documents WHERE id=$1", [id]))
        .rows[0]
    )
      notFound();
    const result = await client.query<CommentRow>(
      "WITH c AS (INSERT INTO comments(id,document_id,author_id,body,section_id) VALUES($1,$2,$3,$4,$5) RETURNING *) SELECT c.*,u.name AS author_name FROM c JOIN users u ON u.id=c.author_id",
      [randomUUID(), id, verified.user.id, input.body, input.sectionId ?? null],
    );
    return comment(result.rows[0]);
  });
}
