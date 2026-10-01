"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { History, RotateCcw, Eye } from "lucide-react";
import type {
  DocumentDetail,
  RevisionDetail,
  RevisionSummary,
} from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { formatDate, statuses } from "@/client/document-format";
import { GitHubReferences } from "./document-github-links";
import { PlanningFileViewer } from "./planning-file-viewer";

export function DocumentHistory({
  document,
  canRestore,
  onRestored,
  onReload,
}: {
  document: DocumentDetail;
  canRestore: boolean;
  onRestored: (document: DocumentDetail) => void;
  onReload: () => void;
}) {
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RevisionDetail | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRevisions(
        (
          await api<{ revisions: RevisionSummary[] }>(
            `/api/documents/${document.id}/revisions`,
          )
        ).revisions,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [document.id, document.currentRevision]);
  useEffect(() => {
    void load();
  }, [load]);
  async function select(number: number) {
    setError("");
    setBusy(true);
    try {
      setSelected(
        await api<RevisionDetail>(
          `/api/documents/${document.id}/revisions/${number}`,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!selected || !summary.trim() || !canRestore) return;
    setError("");
    setBusy(true);
    try {
      const updated = await api<DocumentDetail>(
        `/api/documents/${document.id}/revisions/${selected.number}/restore`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: document.version,
            changeSummary: summary,
          }),
        },
      );
      onRestored(updated);
      setConfirm(false);
      setSelected(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-stack">
      <div>
        <h2>Varje steg finns kvar</h2>
        <p className="muted">
          En ändrad fillista skapar en ny revision med titel, status,
          beskrivning och instruktioner som ögonblicksbild. Metadataändringar
          skapar inga revisioner.
        </p>
      </div>
      {error && (
        <Banner
          status="error"
          title="Historiken kunde inte uppdateras"
          description={error}
          endContent={
            <Button label="Ladda om planeringen" onClick={onReload} />
          }
        />
      )}
      {loading ? (
        <p role="status">Hämtar versionshistorik…</p>
      ) : (
        <ol className="revision-list">
          {revisions.map((revision) => (
            <li key={revision.id}>
              <span className="timeline-icon">
                <History size={18} aria-hidden />
              </span>
              <div className="revision-body">
                <h3>
                  Version {revision.number}
                  {revision.number === document.currentRevision && (
                    <span className="current-label">Aktuell</span>
                  )}
                </h3>
                <p>{revision.changeSummary}</p>
                <p className="muted">
                  {revision.authorName} ·{" "}
                  <time dateTime={revision.createdAt}>
                    {formatDate(revision.createdAt)}
                  </time>
                </p>
              </div>
              <Button
                label={`Visa version ${revision.number}`}
                size="sm"
                icon={<Eye size={16} aria-hidden />}
                onClick={() => void select(revision.number)}
                isDisabled={busy}
              />
            </li>
          ))}
        </ol>
      )}
      {selected && (
        <section className="page-stack historical-version">
          <header className="page-heading">
            <div>
              <p className="eyebrow">TIDIGARE VERSION {selected.number}</p>
              <h2>{selected.title}</h2>
              <p className="muted">
                {statuses[selected.status]} · {selected.authorName} ·{" "}
                {formatDate(selected.createdAt)}
              </p>
            </div>
            <div className="button-row">
              <Button
                label="Stäng version"
                variant="ghost"
                onClick={() => setSelected(null)}
              />
              {selected.number !== document.currentRevision && (
                <Button
                  label="Återställ denna version"
                  icon={<RotateCcw size={16} aria-hidden />}
                  isDisabled={!canRestore}
                  tooltip={
                    !canRestore
                      ? "Planen måste vara Utkast eller Aktiv planering utan osparade ändringar eller versionskonflikt. Redaktörsbehörighet krävs."
                      : undefined
                  }
                  onClick={() => {
                    setSummary(`Återställer version ${selected.number}`);
                    setConfirm(true);
                  }}
                />
              )}
            </div>
          </header>
          <p>{selected.description}</p>
          <GitHubReferences links={selected.githubLinks} />
          <PlanningFileViewer
            key={selected.number}
            files={selected.files}
            title={`${selected.title} · version ${selected.number}`}
          />
          <TextArea
            label="AI-instruktioner i denna version"
            value={selected.instructions}
            isReadOnly
            rows={6}
            width="100%"
          />
        </section>
      )}
      <Dialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        width={520}
        purpose="form"
      >
        <DialogHeader
          title={`Återställ version ${selected?.number ?? ""}`}
          onOpenChange={setConfirm}
        />
        <div className="dialog-content">
          <p>
            Alla filer, titel, status, beskrivning och AI-instruktioner från den
            här versionen blir aktuella. Kommentarer och aktuella
            GitHub-kopplingar behålls.
          </p>
          {error && (
            <Banner
              status="error"
              title="Kunde inte återställa"
              description={error}
            />
          )}
          <TextInput
            label="Ändringsbeskrivning"
            value={summary}
            onChange={setSummary}
            isRequired
            width="100%"
          />
          <div className="button-row">
            <Button label="Avbryt" onClick={() => setConfirm(false)} />
            <Button
              label="Återställ planeringen"
              variant="primary"
              isLoading={busy}
              isDisabled={!summary.trim() || !canRestore}
              onClick={() => void restore()}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
