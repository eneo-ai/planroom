"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FileText, Search, Plus, ArrowUpRight, Layers3 } from "lucide-react";
import { documentSummarySchema, type DocumentSummary } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { formatDate, statusOptions } from "@/client/document-format";
import {
  DocumentStatusBadge,
  DocumentStatusControl,
} from "@/components/document-status";
import { GitHubReferences } from "@/components/document-github-links";
import { useSession } from "@/components/session";

export default function Dashboard() {
  const { user } = useSession();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const canWrite = user?.role === "admin" || user?.role === "editor";
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const result = await api<{ documents: DocumentSummary[] }>(
          `/api/documents?${new URLSearchParams({ q: query, status })}`,
          { signal },
        );
        if (!signal?.aborted) setDocuments(result.documents);
      } catch (cause) {
        if (!signal?.aborted) setError(errorMessage(cause));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query, status],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => void load(controller.signal), 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [load]);
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">GEMENSAM ARBETSYTA</p>
          <h1>Planeringar</h1>
          <p className="muted">
            Samla idéerna. Behåll sammanhanget. Fortsätt tillsammans.
          </p>
        </div>
        {user?.role !== "viewer" && (
          <Button
            label="Ny planering"
            href="/documents/new"
            variant="primary"
            icon={<Plus size={18} aria-hidden />}
          />
        )}
      </header>
      <section className="workspace-intro">
        <Layers3 size={25} aria-hidden />
        <div>
          <h2>En planering som följer med arbetet</h2>
          <p>
            Samla HTML-visualiseringar och Markdown-filer och dela en länk.
            Instruktioner, diskussion och tidigare versioner finns precis
            intill.
          </p>
        </div>
      </section>
      <div className="filter-bar">
        <TextInput
          label="Sök planeringar"
          isLabelHidden
          value={query}
          onChange={setQuery}
          startIcon={<Search size={18} aria-hidden />}
          placeholder="Sök bland era planeringar…"
          hasClear
          size="lg"
          width="100%"
        />
        <Selector
          label="Filtrera efter status"
          isLabelHidden
          options={[{ value: "", label: "Alla statusar" }, ...statusOptions]}
          value={status}
          onChange={setStatus}
          size="lg"
          width={190}
        />
      </div>
      {actionError && (
        <Banner
          status="error"
          title="Statusen kunde inte ändras"
          description={actionError}
          endContent={
            <Button
              label="Hämta aktuell version"
              onClick={() => {
                setActionError("");
                void load();
              }}
            />
          }
        />
      )}
      {notice && (
        <p className="fine-print" role="status">
          {notice}
        </p>
      )}
      {error ? (
        <Banner
          status="error"
          title="Planeringarna kunde inte hämtas"
          description={error}
          endContent={
            <Button label="Försök igen" onClick={() => void load()} />
          }
        />
      ) : loading ? (
        <div role="status" className="loading-state">
          Hämtar planeringar…
        </div>
      ) : documents.length === 0 ? (
        <Card padding={10}>
          <EmptyState
            icon={<FileText size={36} aria-hidden />}
            headingLevel={2}
            title={
              query || status
                ? "Inga planeringar matchar"
                : "Ge första planen en plats"
            }
            description={
              query || status
                ? "Prova en annan sökning eller välj alla statusar."
                : "Importera HTML- och Markdown-filer eller börja med en tom planering. Dela sedan samma länk med hela teamet."
            }
            actions={
              user?.role !== "viewer" &&
              !query &&
              !status && (
                <Button
                  label="Skapa första planeringen"
                  href="/documents/new"
                  variant="primary"
                  icon={<Plus size={18} aria-hidden />}
                />
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="collection-caption">
            <h2>Era planeringar</h2>
            <span className="muted" role="status">
              {documents.length}{" "}
              {documents.length === 1 ? "planering" : "planeringar"}
            </span>
          </div>
          <div className="document-grid">
            {documents.map((document) => (
              <ClickableCard
                key={document.id}
                label={document.title}
                href={`/documents/${document.id}`}
                padding={5}
                className="document-card"
              >
                <div className="document-card-top">
                  <span className="document-card-kind">
                    <FileText size={16} aria-hidden /> Planering
                  </span>
                  {canWrite ? (
                    <DocumentStatusControl
                      document={document}
                      onUpdated={(next) => {
                        const summary = documentSummarySchema.parse(next);
                        setDocuments((current) =>
                          current
                            .map((entry) =>
                              entry.id === summary.id ? summary : entry,
                            )
                            .filter(
                              (entry) => !status || entry.status === status,
                            ),
                        );
                        setActionError("");
                        setNotice(
                          `Statusen för ${next.title} har uppdaterats.`,
                        );
                      }}
                      onError={(cause) => setActionError(errorMessage(cause))}
                    />
                  ) : (
                    <DocumentStatusBadge status={document.status} />
                  )}
                </div>
                <div className="document-card-content">
                  <h3 title={document.title}>{document.title}</h3>
                  <p className="muted clamp-3">
                    {document.description || "Ingen beskrivning ännu."}
                  </p>
                </div>
                <p className="fine-print">
                  {document.files.length}{" "}
                  {document.files.length === 1 ? "fil" : "filer"} ·{" "}
                  {Array.from(
                    new Set(
                      document.files.map((file) =>
                        file.format === "html" ? "HTML" : "Markdown",
                      ),
                    ),
                  ).join(" + ")}
                </p>
                <GitHubReferences links={document.githubLinks} />
                <div className="document-card-footer">
                  <div className="document-card-meta">
                    <span>
                      {document.authorName} · Filrevision{" "}
                      {document.currentRevision}
                    </span>
                    <time dateTime={document.updatedAt}>
                      {formatDate(document.updatedAt)}
                    </time>
                  </div>
                  <span className="document-card-action">
                    Öppna <ArrowUpRight size={18} aria-hidden />
                  </span>
                </div>
              </ClickableCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
