"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import type { SharedProject, SharedDocumentSummary } from "@/contracts";
import { api, ApiError, errorMessage } from "@/client/api";
import { formatDate } from "@/client/document-format";
import { DocumentStatusBadge } from "@/components/document-status";

export default function SharedProjectPage() {
  const { token } = useParams<{ token: string }>();
  return <SharedProjectContent key={token} token={token} />;
}
function SharedProjectContent({ token }: { token: string }) {
  const [project, setProject] = useState<SharedProject | null>(null);
  const [documents, setDocuments] = useState<SharedDocumentSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [reload, setReload] = useState(0);
  const base = `/api/shared/${encodeURIComponent(token)}`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setProject(null);
    setDocuments([]);
    setCursor(null);
    setError("");
    void Promise.all([
      api<SharedProject>(base, { signal: controller.signal }),
      api<{ documents: SharedDocumentSummary[]; nextCursor: string | null }>(
        `${base}/documents`,
        { signal: controller.signal },
      ),
    ])
      .then(([current, result]) => {
        if (controller.signal.aborted) return;
        setProject(current);
        setDocuments(result.documents);
        setCursor(result.nextCursor);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof ApiError && cause.status === 404
              ? "Länken är ogiltig eller har stängts av. Be den som delade projektet om en aktuell länk."
              : errorMessage(cause),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, reload]);
  async function more() {
    if (!cursor || paging) return;
    setPaging(true);
    setError("");
    try {
      const result = await api<{
        documents: SharedDocumentSummary[];
        nextCursor: string | null;
      }>(`${base}/documents?${new URLSearchParams({ cursor })}`);
      setDocuments((current) => [
        ...current,
        ...result.documents.filter(
          (item) => !current.some((entry) => entry.id === item.id),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (cause) {
      // Hide already displayed data when the next request reports revocation.
      if (cause instanceof ApiError && cause.status === 404) {
        setProject(null);
        setDocuments([]);
        setCursor(null);
      }
      setError(errorMessage(cause));
    } finally {
      setPaging(false);
    }
  }
  if (loading) return <p role="status">Hämtar delat projekt…</p>;
  return (
    <div className="page-stack">
      {error && (
        <Banner
          status="error"
          title="Projektet kunde inte hämtas"
          description={error}
          endContent={
            <Button
              label="Försök igen"
              onClick={() => setReload((value) => value + 1)}
              isDisabled={paging}
            />
          }
        />
      )}
      {project && (
        <>
          <header className="page-heading">
            <div>
              <h1>{project.name}</h1>
              <p className="muted">{project.description}</p>
            </div>
          </header>
          <Banner
            status="info"
            title="Du har läsrättigheter"
            description="Här ser du projektets aktuella uppgifter och filer. Du kan inte ändra innehåll eller skriva kommentarer."
          />
          <h2>Uppgifter</h2>
          {documents.length === 0 ? (
            <Card padding={8}>
              <EmptyState
                title="Inga uppgifter ännu"
                description="Uppgifter visas här när de läggs till i projektet."
                headingLevel={3}
              />
            </Card>
          ) : (
            <div className="document-grid">
              {documents.map((item) => (
                <ClickableCard
                  key={item.id}
                  label={item.title}
                  href={`/shared/${encodeURIComponent(token)}/documents/${item.id}`}
                  padding={5}
                  className="document-card"
                >
                  <DocumentStatusBadge status={item.status} />
                  <div className="document-card-copy">
                    <h3>{item.title}</h3>
                    <p className="muted clamp-3">
                      {item.description || "Ingen beskrivning ännu."}
                    </p>
                  </div>
                  <div className="document-card-footer">
                    <span>
                      {item.files.length}{" "}
                      {item.files.length === 1 ? "fil" : "filer"}
                    </span>
                    <time dateTime={item.updatedAt}>
                      {formatDate(item.updatedAt)}
                    </time>
                  </div>
                </ClickableCard>
              ))}
            </div>
          )}
          {cursor && (
            <Button
              label="Visa fler uppgifter"
              onClick={() => void more()}
              isLoading={paging}
            />
          )}
        </>
      )}
    </div>
  );
}
