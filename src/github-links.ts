import { z } from "zod";

const githubUrlPattern =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*)\/((?!\.{1,2}\/)[A-Za-z0-9_.-]+)\/(issues|pull)\/([1-9]\d{0,9})$/;
export const githubLinkUrlSchema = z
  .string()
  .max(2048)
  .regex(
    githubUrlPattern,
    "Ange en GitHub-länk till ett issue eller en pull request, till exempel https://github.com/organisation/repo/issues/123.",
  );

export interface GitHubLink {
  url: string;
  repository: string;
  kind: "issue" | "pull_request";
  number: string;
}

export function githubLink(value: string): GitHubLink {
  const url = githubLinkUrlSchema.parse(value);
  const match = githubUrlPattern.exec(url);
  if (!match) throw new Error("Invalid validated GitHub URL");
  return {
    url,
    repository: `${match[1]}/${match[2]}`,
    kind: match[3] === "pull" ? "pull_request" : "issue",
    number: match[4],
  };
}

const githubLinkInputSchema = z
  .string()
  .trim()
  .max(2048)
  .describe(
    "HTTPS github.com issue or pull-request URL, for example https://github.com/owner/repo/issues/123 or https://github.com/owner/repo/pull/123. Queries and comment anchors are removed.",
  )
  .transform((value) => {
    try {
      const url = new URL(value);
      // Keep only the reference, never credentials, queries or comment anchors.
      if (url.username || url.password || url.port) return value;
      return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
    } catch {
      return value;
    }
  })
  .pipe(githubLinkUrlSchema);

export const githubLinksSchema = z.array(githubLinkUrlSchema).max(20);
export const githubLinksInputSchema = z
  .array(githubLinkInputSchema)
  .max(20)
  .refine(
    (links) =>
      new Set(links.map((link) => link.toLowerCase())).size === links.length,
    "Samma GitHub-koppling får bara finnas en gång.",
  );
