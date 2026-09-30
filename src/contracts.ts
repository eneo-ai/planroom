import { z } from "zod";

export const roleSchema = z.enum(["admin", "editor", "viewer"]);
export const statusSchema = z.enum([
  "draft",
  "active",
  "completed",
  "archived",
]);
export type Role = z.infer<typeof roleSchema>;
export type DocumentStatus = z.infer<typeof statusSchema>;
export const revisionNumberSchema = z.number().int().positive().max(2147483647);
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
  currentRevision: revisionNumberSchema,
  authorName: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export const documentDetailSchema = documentSummarySchema.extend({
  html: z.string(),
  instructions: z.string(),
  changeSummary: z.string(),
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
  html: z.string(),
  instructions: z.string(),
  status: statusSchema,
});
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
});
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    currentRevision: revisionNumberSchema.optional(),
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
  html: z.string().min(1).max(2_000_000),
  instructions: z.string().max(100_000).default(""),
  status: statusSchema.default("draft"),
  changeSummary: z.string().trim().min(1).max(1000),
});
export const updateDocumentSchema = documentContentSchema.extend({
  expectedRevision: revisionNumberSchema,
});
export const restoreSchema = z.object({
  expectedRevision: revisionNumberSchema,
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
