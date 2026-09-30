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
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}
export interface DocumentSummary {
  id: string;
  title: string;
  description: string;
  status: DocumentStatus;
  currentRevision: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}
export interface DocumentDetail extends DocumentSummary {
  html: string;
  instructions: string;
  changeSummary: string;
}
export interface RevisionSummary {
  id: string;
  number: number;
  title: string;
  changeSummary: string;
  authorName: string;
  createdAt: string;
}
export interface RevisionDetail extends RevisionSummary {
  description: string;
  html: string;
  instructions: string;
  status: DocumentStatus;
}
export interface Comment {
  id: string;
  body: string;
  sectionId: string | null;
  authorName: string;
  createdAt: string;
}
export interface ApiToken {
  id: string;
  name: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
}
export interface ApiErrorBody {
  error: { code: string; message: string; currentRevision?: number };
}
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
  expectedRevision: z.number().int().positive().max(2147483647),
});
export const restoreSchema = z.object({
  expectedRevision: z.number().int().positive().max(2147483647),
  changeSummary: z.string().trim().min(1).max(1000),
});
export const commentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  sectionId: z.string().max(200).nullable().optional(),
});
export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scope: z.enum(["read", "write"]),
});
export type DocumentContent = z.infer<typeof documentContentSchema>;
export type DocumentUpdate = z.infer<typeof updateDocumentSchema>;
