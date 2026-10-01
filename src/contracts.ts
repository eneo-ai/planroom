import { z } from "zod";
import { canvasSchema, canvasOperationSchema } from "./canvas";
import { githubLinksInputSchema, githubLinksSchema } from "./github-links";

export const roleSchema = z.enum(["admin", "editor", "viewer"]);
export const statusSchema = z.enum([
  "draft",
  "active",
  "ready",
  "in_development",
  "completed",
  "archived",
]);
export type Role = z.infer<typeof roleSchema>;
export type DocumentStatus = z.infer<typeof statusSchema>;
export const documentStatusLabels: Record<DocumentStatus, string> = {
  draft: "Utkast",
  active: "Aktiv planering",
  ready: "Redo för utveckling",
  in_development: "Under utveckling",
  completed: "Klart",
  archived: "Arkiverat",
};
export function canEditDocumentContent(status: DocumentStatus): boolean {
  return status === "draft" || status === "active";
}
export const revisionNumberSchema = z.number().int().positive().max(2147483647);
export const maxPlanningFiles = 20;
export const maxPlanningSourceLength = 2_000_000;
export const planningFileFormatSchema = z.enum(["html", "markdown"]);
export function planningFileFormat(name: string): PlanningFileFormat | null {
  if (/\.html?$/i.test(name)) return "html";
  if (/\.(md|markdown)$/i.test(name)) return "markdown";
  return null;
}
// PostgreSQL JSONB cannot preserve NUL or malformed Unicode. Reject rather than
// replacing characters or discovering this only after starting a write.
const planningFileTextSchema = z
  .string()
  .refine(
    (value) => value.isWellFormed() && !value.includes("\0"),
    "Filens text måste vara giltig Unicode utan nolltecken.",
  );
export const planningFileSummarySchema = z.object({
  id: z.uuid(),
  name: planningFileTextSchema
    .min(1)
    .max(200)
    .regex(/^[^/\\\x00-\x1f\x7f]+$/),
  format: planningFileFormatSchema,
});
export const planningFileSchema = planningFileSummarySchema
  .extend({
    content: planningFileTextSchema.min(1).max(maxPlanningSourceLength),
  })
  .superRefine((file, context) => {
    if (planningFileFormat(file.name) !== file.format)
      context.addIssue({
        code: "custom",
        path: ["name"],
        message:
          "Filnamnet måste sluta med .html/.htm för HTML eller .md/.markdown för Markdown.",
      });
  });
export const planningFilesSchema = z
  .array(planningFileSchema)
  .min(1, "Lägg till minst en HTML- eller Markdown-fil.")
  .max(maxPlanningFiles)
  .superRefine((files, context) => {
    if (
      files.reduce((length, file) => length + file.content.length, 0) >
      maxPlanningSourceLength
    )
      context.addIssue({
        code: "custom",
        message: "Filernas källor får tillsammans vara högst 2 000 000 tecken.",
      });
    const ids = new Set<string>();
    const names = new Set<string>();
    files.forEach((file, index) => {
      const id = file.id.toLowerCase();
      if (ids.has(id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Varje fil måste ha ett eget id.",
        });
      const name = file.name.toLowerCase();
      if (names.has(name))
        context.addIssue({
          code: "custom",
          path: [index, "name"],
          message: "Varje fil måste ha ett eget filnamn.",
        });
      ids.add(id);
      names.add(name);
    });
  });
export type PlanningFileFormat = z.infer<typeof planningFileFormatSchema>;
export type PlanningFile = z.infer<typeof planningFileSchema>;
export type PlanningFileSummary = z.infer<typeof planningFileSummarySchema>;
export const tokenScopeSchema = z.enum(["read", "write"]);
const timestampSchema = z.iso.datetime();
export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  mustChangePassword: z.boolean(),
});
export const documentSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: statusSchema,
  githubLinks: githubLinksSchema,
  files: z.array(planningFileSummarySchema),
  githubLinksVersion: revisionNumberSchema,
  version: revisionNumberSchema,
  currentRevision: revisionNumberSchema,
  authorName: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export const documentDetailSchema = documentSummarySchema.extend({
  files: z.array(planningFileSchema),
  instructions: z.string(),
  changeSummary: z.string(),
  canvas: canvasSchema.nullable(),
});
export const revisionSummarySchema = z.object({
  id: z.uuid(),
  number: revisionNumberSchema,
  title: z.string(),
  changeSummary: z.string(),
  authorName: z.string(),
  createdAt: timestampSchema,
});
export const revisionDetailSchema = revisionSummarySchema.extend({
  description: z.string(),
  files: z.array(planningFileSchema),
  instructions: z.string(),
  status: statusSchema,
  githubLinks: githubLinksSchema,
  canvas: canvasSchema.nullable(),
});
export const documentGitHubLinksSchema = z.object({
  githubLinks: githubLinksSchema,
  githubLinksVersion: revisionNumberSchema,
});
export type DocumentGitHubLinks = z.infer<typeof documentGitHubLinksSchema>;
export const commentResponseSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  sectionId: z.string().nullable(),
  authorName: z.string(),
  createdAt: timestampSchema,
});
export const apiTokenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  scope: tokenScopeSchema,
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  lastUsedAt: timestampSchema.nullable(),
  maskedToken: z
    .string()
    .regex(/^\*{8}[A-Za-z0-9_-]{4}$/)
    .nullable(),
});
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    currentRevision: revisionNumberSchema.optional(),
    currentVersion: revisionNumberSchema.optional(),
  }),
});
export const userResponseSchema = z.object({ user: userSchema });
export const sessionResponseSchema = z.object({ user: userSchema.nullable() });
export const documentsResponseSchema = z.object({
  documents: z.array(documentSummarySchema),
});
export const revisionsResponseSchema = z.object({
  revisions: z.array(revisionSummarySchema),
});
export const commentsResponseSchema = z.object({
  comments: z.array(commentResponseSchema),
});
export const tokensResponseSchema = z.object({
  tokens: z.array(apiTokenSchema),
});
export const usersResponseSchema = z.object({ users: z.array(userSchema) });
export const createdTokenResponseSchema = z.object({
  token: z.string(),
  record: apiTokenSchema,
});
export const okResponseSchema = z.object({ ok: z.literal(true) });
export const healthyResponseSchema = z.object({ status: z.literal("ok") });
export const unavailableResponseSchema = z.object({
  status: z.literal("unavailable"),
});
export const apiDiscoverySchema = z.object({
  name: z.string(),
  version: z.string(),
  documentation: z.string(),
  openapi: z.string(),
  mcp: z.object({
    endpoint: z.string(),
    documentation: z.string(),
    protocol: z.string(),
  }),
});
export type User = z.infer<typeof userSchema>;
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type DocumentDetail = z.infer<typeof documentDetailSchema>;
export type RevisionSummary = z.infer<typeof revisionSummarySchema>;
export type RevisionDetail = z.infer<typeof revisionDetailSchema>;
export type Comment = z.infer<typeof commentResponseSchema>;
export type ApiToken = z.infer<typeof apiTokenSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
export const passwordSchema = z
  .string()
  .min(12, "Lösenordet måste ha minst 12 tecken.")
  .max(256);
export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export const setupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  currentPassword: z.string().min(1).max(256),
  password: passwordSchema,
});
export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});
export const documentContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  files: planningFilesSchema,
  instructions: z.string().max(100_000).default(""),
  status: statusSchema.default("draft"),
  changeSummary: z.string().trim().min(1).max(1000),
});
export const updateDocumentSchema = documentContentSchema.extend({
  expectedVersion: revisionNumberSchema,
});
export const updateDocumentStatusSchema = z.strictObject({
  expectedVersion: revisionNumberSchema,
  status: statusSchema,
});
export const updateDocumentGitHubLinksSchema = z.strictObject({
  expectedLinksVersion: revisionNumberSchema,
  githubLinks: githubLinksInputSchema,
});
export const restoreSchema = z.object({
  expectedVersion: revisionNumberSchema,
  changeSummary: z.string().trim().min(1).max(1000),
});
export const commentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  sectionId: z.string().max(200).nullable().optional(),
});
export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: tokenScopeSchema,
});
export type DocumentContent = z.infer<typeof documentContentSchema>;
export type DocumentUpdate = z.infer<typeof updateDocumentSchema>;
export type DocumentStatusUpdate = z.infer<typeof updateDocumentStatusSchema>;
export type DocumentGitHubLinksUpdate = z.infer<
  typeof updateDocumentGitHubLinksSchema
>;

export type RestoreInput = z.infer<typeof restoreSchema>;

export const updateCanvasSchema = z.strictObject({
  expectedVersion: revisionNumberSchema,
  changeSummary: z.string().trim().min(1).max(1000),
  operations: z.array(canvasOperationSchema).min(1).max(300),
});
export const documentCanvasSchema = z.object({
  documentId: z.uuid(),
  version: revisionNumberSchema,
  currentRevision: revisionNumberSchema,
  status: statusSchema,
  canvas: canvasSchema.nullable(),
});
export const canvasConfigurationSchema = z.object({
  licenseKey: z.string().nullable(),
});
export type CanvasUpdate = z.infer<typeof updateCanvasSchema>;
export type DocumentCanvas = z.infer<typeof documentCanvasSchema>;
