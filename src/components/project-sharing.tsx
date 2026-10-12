"use client";

import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import type { ProjectSharing, ProjectSharingUpdate } from "@/contracts";
import { api, errorMessage } from "@/client/api";

export function ProjectSharingSettings({ projectId }: { projectId: string }) {
  const [sharing, setSharing] = useState<ProjectSharing | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ProjectSharingUpdate["action"] | null>(
    null,
  );
  const [origin, setOrigin] = useState("");
  const [reload, setReload] = useState(0);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setOrigin(window.location.origin);
    setSharing(null);
    setError("");
    setConflict(false);
    void api<ProjectSharing>(`/api/projects/${projectId}/sharing`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setSharing(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [projectId, reload]);
  const url = sharing?.path ? `${origin}${sharing.path}` : "";
  async function change() {
    if (!sharing || !action || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<ProjectSharing>(
        `/api/projects/${projectId}/sharing`,
        {
          method: "PUT",
          body: JSON.stringify({ action, expectedVersion: sharing.version }),
        },
      );
      setSharing(result);
      setAction(null);
      setNotice(
        result.path
          ? "Projektet kan nu läsas av alla som har länken."
          : "Publik delning är avstängd. Den tidigare länken fungerar inte längre.",
      );
    } catch (cause) {
      // The outcome may be unknown after a network interruption. Require a
      // refresh before another mutation rather than retrying a stale decision.
      setConflict(true);
      setAction(null);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Länken har kopierats.");
    } catch {
      setNotice(
        "Länken kunde inte kopieras. Markera och kopiera den i fältet.",
      );
    }
  }
  const title =
    action === "disable"
      ? "Stäng av publik delning?"
      : action === "rotate"
        ? "Byt delningslänk?"
        : "Dela projektet publikt?";
  return (
    <section className="narrow-content page-stack" aria-label="Publik delning">
      <div>
        <h2>Publik delning</h2>
        <p className="muted">
          Visa projektet för personer utanför teamet utan att skapa konton.
        </p>
      </div>
      {error && (
        <Banner
          status="error"
          title="Delningen kunde inte hanteras"
          description={error}
          endContent={
            <Button
              label="Hämta aktuell delning"
              onClick={() => setReload((value) => value + 1)}
            />
          }
        />
      )}
      {!sharing && !error && <p role="status">Hämtar delningsinställning…</p>}
      {sharing && (
        <>
          <Banner
            status="info"
            title={
              sharing.path
                ? "Alla med länken kan läsa"
                : "Projektet delas inte publikt"
            }
            description="Länken visar projektets namn och beskrivning samt alla nuvarande och framtida uppgifter, filer och diagram, oavsett status. Diskussion, versionshistorik, AI-instruktioner och GitHub-kopplingar visas inte. Besökare kan inte ändra något."
          />
          {sharing.path && (
            <>
              <TextInput
                label="Publik läslänk"
                value={url}
                isReadOnly
                width="100%"
              />
              <div className="button-row">
                <Button
                  label="Kopiera länk"
                  icon={<Copy size={16} aria-hidden />}
                  onClick={() => void copy()}
                  isDisabled={busy || conflict}
                />
                <Button
                  label="Öppna läsvy"
                  href={sharing.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<ExternalLink size={16} aria-hidden />}
                  isDisabled={busy || conflict}
                />
              </div>
            </>
          )}
          <div className="button-row">
            <Button
              label={
                sharing.path ? "Stäng av delning" : "Aktivera publik delning"
              }
              icon={<Share2 size={16} aria-hidden />}
              onClick={() => setAction(sharing.path ? "disable" : "enable")}
              isDisabled={busy || conflict}
            />
            {sharing.path && (
              <Button
                label="Byt länk"
                variant="ghost"
                onClick={() => setAction("rotate")}
                isDisabled={busy || conflict}
              />
            )}
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="fine-print">
          {notice}
        </p>
      )}
      <Dialog
        isOpen={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
        purpose="form"
        width={520}
      >
        <DialogHeader title={title} />
        <div className="dialog-content">
          <p>
            {action === "disable"
              ? "Den befintliga länken slutar fungera. Redan visat eller sparat innehåll kan inte tas tillbaka. Om du aktiverar delning igen skapas en ny länk."
              : action === "rotate"
                ? "Den befintliga länken slutar fungera och ersätts med en ny. Dela den nya länken med de personer som ska kunna läsa projektet."
                : "Alla som får länken kan läsa projektet och dess uppgifter utan att logga in, även uppgifter som läggs till senare. Länken kan vidarebefordras. Du kan stänga av delningen när som helst."}
          </p>
          <div className="button-row">
            <Button
              label="Avbryt"
              onClick={() => setAction(null)}
              isDisabled={busy}
            />
            <Button
              label={
                action === "disable"
                  ? "Stäng av delning"
                  : action === "rotate"
                    ? "Skapa ny länk"
                    : "Aktivera delning"
              }
              variant="primary"
              onClick={() => void change()}
              isLoading={busy}
            />
          </div>
        </div>
      </Dialog>
    </section>
  );
}
