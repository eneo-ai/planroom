"use client";

import { useState, type FormEvent } from "react";
import { Link } from "@astryxdesign/core/Link";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Github, GitPullRequest, CircleDot, Plus, Unlink } from "lucide-react";
import {
  updateDocumentGitHubLinksSchema,
  type DocumentDetail,
} from "@/contracts";
import { githubLink, type GitHubLink } from "@/github-links";
import { api } from "@/client/api";

function GitHubReference({ reference }: { reference: GitHubLink }) {
  const Icon = reference.kind === "pull_request" ? GitPullRequest : CircleDot;
  return (
    <Link
      href={reference.url}
      isExternalLink
      isStandalone
      newTabLabel="(öppnas i ny flik)"
    >
      <Icon size={15} aria-hidden /> {reference.repository} ·{" "}
      {reference.kind === "pull_request" ? "PR" : "Issue"} #{reference.number}
    </Link>
  );
}

export function GitHubReferences({ links }: { links: string[] }) {
  if (links.length === 0) return null;
  return (
    <div className="github-references" aria-label="GitHub-kopplingar">
      <Github size={18} aria-hidden />
      {links.map((url) => (
        <GitHubReference key={url} reference={githubLink(url)} />
      ))}
    </div>
  );
}

export function DocumentGitHubLinks({
  document,
  canWrite,
  isDisabled,
  onUpdated,
  onError,
  onSavingChange,
}: {
  document: DocumentDetail;
  canWrite: boolean;
  isDisabled: boolean;
  onUpdated: (next: DocumentDetail) => void;
  onError: (cause: unknown) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(links: string[], clearInput = false) {
    if (!canWrite || isDisabled || busy) return;
    const parsed = updateDocumentGitHubLinksSchema.safeParse({
      githubLinks: links,
      expectedRevision: document.currentRevision,
    });
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues.map((issue) => issue.message).join(" · "),
      );
      return;
    }
    setValidationError("");
    setBusy(true);
    onSavingChange(true);
    try {
      onUpdated(
        await api<DocumentDetail>(
          `/api/documents/${document.id}/github-links`,
          {
            method: "PUT",
            body: JSON.stringify(parsed.data),
          },
        ),
      );
      if (clearInput) setUrl("");
    } catch (cause) {
      onError(cause);
    } finally {
      setBusy(false);
      onSavingChange(false);
    }
  }
  function add(event: FormEvent) {
    event.preventDefault();
    void save([...document.githubLinks, url], true);
  }
  return (
    <section className="form-stack" aria-labelledby="github-heading">
      <div className="button-row">
        <Github size={21} aria-hidden />
        <h2 id="github-heading">GitHub-kopplingar</h2>
      </div>
      <p className="muted">
        Koppla planen till issues och pull requests. Kopplingarna kan uppdateras
        även när planen är låst.
      </p>
      {document.githubLinks.length > 0 ? (
        <ul className="github-link-list">
          {document.githubLinks.map((url) => {
            const reference = githubLink(url);
            return (
              <li key={url}>
                <GitHubReference reference={reference} />
                {canWrite && (
                  <Button
                    label={`Ta bort koppling till ${reference.repository} #${reference.number}`}
                    size="sm"
                    variant="ghost"
                    icon={<Unlink size={15} aria-hidden />}
                    isDisabled={isDisabled || busy}
                    onClick={() =>
                      void save(
                        document.githubLinks.filter((link) => link !== url),
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
            label="Länk till GitHub-issue eller PR"
            value={url}
            onChange={(next) => {
              setUrl(next);
              setValidationError("");
            }}
            placeholder="https://github.com/organisation/repo/issues/123"
            isDisabled={isDisabled || busy}
            status={
              validationError
                ? { type: "error", message: validationError }
                : undefined
            }
            width="100%"
          />
          <Button
            label="Lägg till koppling"
            type="submit"
            icon={<Plus size={16} aria-hidden />}
            isLoading={busy}
            isDisabled={
              isDisabled ||
              busy ||
              !url.trim() ||
              document.githubLinks.length >= 20
            }
          />
          {(isDisabled || document.githubLinks.length >= 20) && (
            <p className="fine-print">
              {document.githubLinks.length >= 20
                ? "En planering kan ha högst 20 kopplingar."
                : "Spara eller förkasta osparade ändringar och ladda om vid en versionskonflikt innan du ändrar kopplingar."}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
