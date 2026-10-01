import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  Comment,
  DocumentContent,
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
interface DocumentRow extends Omit<RevisionRow, "created_at"> {
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
>;
type RevisionSummaryRow = Pick<
  RevisionRow,
  "id" | "number" | "title" | "change_summary" | "author_name" | "created_at"
>;
const currentSelect = `SELECT r.id,r.document_id,r.number,r.html,d.title,d.description,d.instructions,d.status,d.change_summary,d.version,d.github_links,d.github_links_version,u.name AS author_name,d.created_at AS document_created_at,d.updated_at FROM documents d JOIN document_revisions r ON r.document_id=d.id AND r.number=d.current_revision JOIN users u ON u.id=d.author_id`;
const summarySelect = `SELECT d.id AS document_id,d.current_revision AS number,d.title,d.description,d.status,d.version,d.github_links,d.github_links_version,u.name AS author_name,d.created_at AS document_created_at,d.updated_at FROM documents d JOIN users u ON u.id=d.author_id`;
function summary(row: SummaryRow): DocumentSummary {
  return {
    id: row.document_id,
    title: row.title,
    description: row.description,
    status: row.status,
    githubLinks: row.github_links,
    githubLinksVersion: row.github_links_version,
    version: row.version,
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
    `${summarySelect} WHERE ($1::text IS NULL OR d.title ILIKE '%' || $1 || '%' OR d.description ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR d.status=$2) ORDER BY d.updated_at DESC LIMIT 200`,
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
  content: DocumentContent,
  githubLinks: string[],
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
      githubLinks,
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
    "INSERT INTO documents(id,current_revision,title,description,instructions,status,change_summary,author_id) VALUES($1,1,$2,$3,$4,$5,$6,$7)",
    [
      id,
      content.title,
      content.description,
      content.instructions,
      content.status,
      content.changeSummary,
      author.id,
    ],
  );
  await insertRevision(client, author, id, 1, content, []);
  return fetchDocument(client, id);
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
  ) => Promise<DocumentContent>,
): Promise<DocumentDetail> {
  assertWrite(principal);
  return transaction(async (client) => {
    const verified = await lockWritePrincipal(client, principal);
    await lockDocument(client, id, expectedVersion);
    const current = await fetchDocument(client, id);
    const content = await change(current, client);
    const htmlChanged = content.html !== current.html;
    const metadataChanged =
      content.title !== current.title ||
      content.description !== current.description ||
      content.instructions !== current.instructions ||
      content.status !== current.status;
    // An identical save is not a new edit, even if its summary differs.
    if (!htmlChanged && !metadataChanged) return current;
    const number = current.currentRevision + (htmlChanged ? 1 : 0);
    if (htmlChanged)
      await insertRevision(
        client,
        verified.user,
        id,
        number,
        content,
        current.githubLinks,
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
    return fetchDocument(client, id);
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
      return content;
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
    await lockDocument(client, id, input.expectedVersion);
    const result = await client.query<SummaryRow>(
      `${summarySelect} WHERE d.id=$1`,
      [id],
    );
    const current = summary(result.rows[0]);
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
      `${summarySelect} WHERE d.id=$1`,
      [id],
    );
    return summary(next.rows[0]);
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
    "SELECT github_links,github_links_version FROM documents WHERE id=$1",
    [id],
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
    await lockWritePrincipal(client, principal);
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
        html: source.html,
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
