"use client";

import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { TextArea } from "@astryxdesign/core/TextArea";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Link } from "@astryxdesign/core/Link";
import { Sparkles, Copy, Workflow, RefreshCw } from "lucide-react";
import {
  canEditDocumentContent,
  documentCanvasSchema,
  type DocumentDetail,
} from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { canvasPrompt } from "@/canvas-prompt";
import { CanvasViewer } from "./canvas-viewer";
import styles from "./document-canvas.module.css";

const examples = [
  {
    label: "Arkitektur",
    request:
      "Visualisera planens arkitektur med komponenter och informationsflöden. Markera öppna frågor.",
  },
  {
    label: "Process",
    request:
      "Rita planens process som ett flödesschema med viktiga beslut och undantag.",
  },
  {
    label: "Alternativ",
    request:
      "Visualisera två rimliga lösningsalternativ från planen, med fördelar och risker bredvid varandra.",
  },
];

export function DocumentCanvas({
  document: plan,
  canWrite,
  onUpdated,
}: {
  document: DocumentDetail;
  canWrite: boolean;
  onUpdated: (document: DocumentDetail) => void;
}) {
  const [composer, setComposer] = useState(false);
  const [request, setRequest] = useState(examples[0].request);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const editable = canWrite && canEditDocumentContent(plan.status);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      try {
        if (document.visibilityState === "visible") {
          const next = documentCanvasSchema.parse(
            await api(`/api/documents/${plan.id}/canvas`, {
              signal: controller.signal,
            }),
          );
          if (!controller.signal.aborted && next.version > plan.version) {
            const latest = await api<DocumentDetail>(
              `/api/documents/${plan.id}`,
              { signal: controller.signal },
            );
            if (!controller.signal.aborted) onUpdated(latest);
          }
          if (!controller.signal.aborted) {
            setError("");
            failures = 0;
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(errorMessage(cause));
          failures++;
        }
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(
            () => void poll(),
            Math.min(30000, 3000 * 2 ** Math.min(failures, 3)),
          );
      }
    }
    void poll();
    // Abort reads and release the timer when leaving the canvas tab or document.
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [plan.id, plan.version, onUpdated, refresh]);

  async function copyAssignment() {
    try {
      await navigator.clipboard.writeText(canvasPrompt(plan.id, request));
      setNotice(
        "AI-uppdraget är kopierat. Klistra in det i din AI-klient som är ansluten till Planroom. Diagrammet visas här när AI sparar.",
      );
      setComposer(false);
    } catch {
      setError(
        "Uppdraget kunde inte kopieras. Markera och kopiera uppdragstexten i dialogen.",
      );
    }
  }
  return (
    <div className={styles.root}>
      <div className={styles.heading}>
        <div className={styles.headingText}>
          <p className="eyebrow">FRÅN PLAN TILL BILD</p>
          <h2>Låt AI göra sambanden synliga</h2>
          <p className="muted">
            Utforska arkitektur, processer och idéer i ett diagram som AI kan
            bygga vidare på. Originalfilerna och varje sparat steg finns kvar.
          </p>
        </div>
        {editable && (
          <Button
            label={plan.canvas ? "Utveckla med AI" : "Visualisera med AI"}
            variant="primary"
            icon={<Sparkles size={18} aria-hidden />}
            onClick={() => {
              setNotice("");
              setComposer(true);
            }}
          />
        )}
      </div>
      {notice && (
        <Banner
          status="success"
          title="Uppdraget är redo"
          description={notice}
          isDismissable
          onDismiss={() => setNotice("")}
          dismissLabel="Stäng meddelande"
        />
      )}
      {error && (
        <Banner
          status="error"
          title="Visualiseringen kunde inte uppdateras"
          description={error}
          endContent={
            <Button
              label="Försök igen"
              onClick={() => setRefresh((value) => value + 1)}
            />
          }
        />
      )}
      {plan.canvas?.shapes.length ? (
        <CanvasViewer canvas={plan.canvas} />
      ) : (
        <Card>
          <div className={styles.empty}>
            <EmptyState
              title="En tydligare bild av din plan"
              description={
                editable
                  ? "Beskriv vad du vill förstå. Din anslutna AI-klient läser planen och ritar direkt här."
                  : "Här visas visualiseringar som en redaktör eller ansluten AI skapar."
              }
              icon={<Workflow size={44} />}
              actions={
                editable ? (
                  <Button
                    label="Skapa ett AI-uppdrag"
                    icon={<Sparkles size={16} aria-hidden />}
                    onClick={() => setComposer(true)}
                  />
                ) : undefined
              }
            />
          </div>
        </Card>
      )}
      <p className={styles.status} role="status">
        <RefreshCw size={14} aria-hidden />
        {error
          ? "Automatisk uppdatering återupptas när anslutningen fungerar."
          : `Sparad innehållsrevision ${plan.currentRevision} · Uppdateras automatiskt när AI arbetar`}
      </p>
      <Dialog
        isOpen={composer}
        onOpenChange={setComposer}
        width={700}
        maxHeight="90dvh"
        purpose="form"
      >
        <DialogHeader title="Vad vill du visualisera?" />
        <div className={styles.composer}>
          <p className="muted">
            Skapa ett uppdrag för Codex eller en annan AI-klient som är ansluten
            till Planroom. AI ritar i den här planen genom samma behörigheter
            som ditt konto.
          </p>
          <div className={styles.examples}>
            {examples.map((example) => (
              <Button
                key={example.label}
                label={example.label}
                size="sm"
                onClick={() => setRequest(example.request)}
              />
            ))}
          </div>
          <TextArea
            label="Beskriv visualiseringen"
            value={request}
            onChange={setRequest}
            rows={4}
            maxLength={4000}
          />
          <Button
            label="Kopiera AI-uppdrag"
            variant="primary"
            icon={<Copy size={16} aria-hidden />}
            isDisabled={!request.trim() || !editable}
            onClick={() => void copyAssignment()}
          />
          <Link href="/settings" isStandalone>
            Konfigurera din AI-anslutning
          </Link>
          <details>
            <summary>Visa hela uppdraget</summary>
            <TextArea
              label="Uppdrag att kopiera"
              value={canvasPrompt(plan.id, request)}
              isReadOnly
              rows={10}
            />
          </details>
        </div>
      </Dialog>
    </div>
  );
}
