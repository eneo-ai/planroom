"use client";

import { useState, type FormEvent } from "react";
import { Link } from "@astryxdesign/core/Link";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Banner } from "@astryxdesign/core/Banner";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Github, GitPullRequest, CircleDot, Plus, Unlink } from "lucide-react";
import {
  updateDocumentGitHubLinksSchema,
  type DocumentGitHubLinks,
} from "@/contracts";
import { githubLink, type GitHubLink } from "@/github-links";
import { api, ApiError, errorMessage } from "@/client/api";

function GitHubReference({
  reference,
  compact = false,
}: {
  reference: GitHubLink;
  compact?: boolean;
}) {
  const Icon = reference.kind === "pull_request" ? GitPullRequest : CircleDot;
  const label = `${reference.kind === "pull_request" ? "PR" : "Issue"} #${reference.number}`;
  return (
    <Link
      href={reference.url}
      isExternalLink
      isStandalone
      label={`${reference.repository}, ${label} (öppnas i ny flik)`}
      newTabLabel="(öppnas i ny flik)"
    >
      <Icon size={16} aria-hidden />
      {compact ? (
        <span>
          {reference.repository.split("/")[1]} #{reference.number}
        </span>
      ) : (
        <span className="github-reference-copy">
          <strong>{label}</strong>
          <span className="muted">{reference.repository}</span>
        </span>
      )}
    </Link>
  );
}

/** Keep card/header summaries bounded; the dialog contains the complete list. */
export function GitHubReferences({ links }: { links: string[] }) {
  if (links.length === 0) return null;
  return (
    <div
      className="github-references"
      aria-label={`${links.length} GitHub-kopplingar`}
    >
      <Github size={16} aria-hidden />
      {links.slice(0, 2).map((url) => (
        <GitHubReference key={url} reference={githubLink(url)} compact />
      ))}
      {links.length > 2 && (
        <span className="fine-print">+{links.length - 2} till</span>
      )}
    </div>
  );
}

export function DocumentGitHubLinks({
  documentId,
  metadata,
  canWrite,
  onUpdated,
  onSavingChange,
}: {
  documentId: string;
  metadata: DocumentGitHubLinks;
  canWrite: boolean;
  onUpdated: (next: DocumentGitHubLinks) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(links: string[], clearInput = false) {
    if (!canWrite || busy || conflict) return;
    const parsed = updateDocumentGitHubLinksSchema.safeParse({
      githubLinks: links,
      expectedLinksVersion: metadata.githubLinksVersion,
    });
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues.map((issue) => issue.message).join(" · "),
      );
      return;
    }
    if (
      clearInput &&
      parsed.data.githubLinks.length === metadata.githubLinks.length
    ) {
      setValidationError("Den kopplingen finns redan i planen.");
      return;
    }
    setValidationError("");
    setError("");
    setBusy(true);
    onSavingChange(true);
    try {
      onUpdated(
        await api<DocumentGitHubLinks>(
          `/api/documents/${documentId}/github-links`,
          {
            method: "PUT",
            body: JSON.stringify(parsed.data),
          },
        ),
      );
      if (clearInput) setUrl("");
    } catch (cause) {
      setConflict(
        cause instanceof ApiError && cause.code === "GITHUB_LINKS_CONFLICT",
      );
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      onSavingChange(false);
    }
  }
  async function reload() {
    if (busy) return;
    setBusy(true);
    onSavingChange(true);
    try {
      onUpdated(
        await api<DocumentGitHubLinks>(
          `/api/documents/${documentId}/github-links`,
        ),
      );
      setConflict(false);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      onSavingChange(false);
    }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    void save([...metadata.githubLinks, url], true);
  }
  return (
    <div className="form-stack">
      <p className="muted">
        Koppla issues och pull requests till planen. Kopplingar kan ändras även
        när planen är låst och skapar ingen HTML-revision.
      </p>
      {error && (
        <Banner
          status="error"
          title="Kopplingarna kunde inte uppdateras"
          description={error}
          endContent={
            conflict ? (
              <Button
                label="Hämta senaste kopplingarna"
                isLoading={busy}
                onClick={() => void reload()}
              />
            ) : undefined
          }
        />
      )}
      {metadata.githubLinks.length > 0 ? (
        <ul className="github-link-list">
          {metadata.githubLinks.map((url) => {
            const reference = githubLink(url);
            return (
              <li key={url}>
                <GitHubReference reference={reference} />
                {canWrite && (
                  <IconButton
                    label={`Ta bort ${reference.kind === "pull_request" ? "PR" : "issue"} #${reference.number} från ${reference.repository}`}
                    size="sm"
                    variant="ghost"
                    icon={<Unlink size={16} aria-hidden />}
                    tooltip="Ta bort koppling"
                    isDisabled={busy || conflict}
                    onClick={() =>
                      void save(
                        metadata.githubLinks.filter((link) => link !== url),
                      )
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="fine-print">
          Inga issues eller pull requests kopplade ännu.
        </p>
      )}
      {canWrite && (
        <form className="github-link-form" onSubmit={add}>
          <TextInput
            label="Länk till issue eller pull request"
            value={url}
            onChange={(next) => {
              setUrl(next);
              setValidationError("");
            }}
            placeholder="https://github.com/organisation/repo/issues/123"
            isDisabled={busy || conflict}
            status={
              validationError
                ? { type: "error", message: validationError }
                : undefined
            }
            width="100%"
          />
          <Button
            label="Koppla"
            type="submit"
            icon={<Plus size={16} aria-hidden />}
            isLoading={busy}
            isDisabled={
              busy ||
              conflict ||
              !url.trim() ||
              metadata.githubLinks.length >= 20
            }
          />
          {metadata.githubLinks.length >= 20 && (
            <p className="fine-print">
              En planering kan ha högst 20 kopplingar. Ta bort en för att lägga
              till en ny.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
