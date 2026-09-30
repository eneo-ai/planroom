"use client";

import { useMemo, useReducer, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  ShieldCheck,
  Play,
  Monitor,
  Smartphone,
  Expand,
  Minimize,
} from "lucide-react";
import { htmlPreview, htmlPreviewConsent } from "@/client/html-preview";
import styles from "./html-viewer.module.css";

export function HtmlViewer({ html, title }: { html: string; title: string }) {
  const [consent, dispatchConsent] = useReducer(htmlPreviewConsent, {
    source: html,
    mode: "protected",
  });
  // Reset before committing changed markup, including an import finishing while
  // the confirmation dialog is open. Delayed actions for old sources are ignored.
  if (consent.source !== html)
    dispatchConsent({ type: "source-changed", source: html });
  const interactive = consent.source === html && consent.mode === "interactive";
  const confirm = consent.source === html && consent.mode === "confirming";
  function closeConfirmation(open: boolean) {
    if (!open) dispatchConsent({ type: "dismiss", source: html });
  }
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const source = useMemo(
    () => htmlPreview(html, interactive),
    [html, interactive],
  );
  const security = (
    <span className="viewer-security">
      <ShieldCheck size={16} aria-hidden />
      {interactive ? "Interaktivitet aktiverad" : "Skyddad visning"}
    </span>
  );
  const controls = (
    <div className="button-row">
      <Button
        label={compact ? "Visa bred vy" : "Visa smal vy"}
        size="sm"
        variant="ghost"
        icon={
          compact ? (
            <Monitor size={16} aria-hidden />
          ) : (
            <Smartphone size={16} aria-hidden />
          )
        }
        onClick={() => setCompact(!compact)}
      />
      <Button
        label={
          interactive ? "Stäng av interaktivitet" : "Aktivera interaktivitet"
        }
        size="sm"
        variant="secondary"
        icon={<Play size={14} aria-hidden />}
        onClick={() =>
          dispatchConsent({
            type: interactive ? "disable" : "request",
            source: html,
          })
        }
      />
    </div>
  );
  const frame = (
    <iframe
      key={interactive ? "interactive" : "protected"}
      title={`Förhandsvisning: ${title}`}
      srcDoc={source}
      sandbox={interactive ? "allow-scripts" : ""}
      referrerPolicy="no-referrer"
      className={`html-frame ${styles.frame}`}
    />
  );
  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        {security}
        <div className="button-row">
          {!expanded && controls}
          <Button
            label="Expandera"
            size="sm"
            variant="secondary"
            icon={<Expand size={16} aria-hidden />}
            aria-expanded={expanded}
            onClick={() => setExpanded(true)}
          />
        </div>
      </div>
      <div
        className={`viewer-canvas ${compact ? "compact" : ""} ${expanded ? styles.placeholder : ""}`}
      >
        {!expanded && frame}
      </div>
      <p className="fine-print">
        Externa resurser, inklusive typsnitt och skript, blockeras. Reglage i
        planens demonstrationer sparas inte som beslut eller uppgiftsstatus.
      </p>
      <p className="fine-print">
        Du kan expandera planen till helskärm. När visningsläget ändras startas
        förhandsvisningen om och tillfälliga demovärden återställs.
      </p>
      <Dialog
        isOpen={expanded}
        onOpenChange={setExpanded}
        variant="fullscreen"
        purpose="form"
      >
        <DialogHeader
          title={title || "Förhandsvisning"}
          endContent={
            <Button
              label="Stäng helskärm"
              variant="secondary"
              icon={<Minimize size={16} aria-hidden />}
              onClick={() => setExpanded(false)}
            />
          }
        />
        <div className={styles.fullscreenBody}>
          {expanded && (
            <>
              <div className="viewer-toolbar">
                {security}
                {controls}
              </div>
              <div
                className={`viewer-canvas ${compact ? "compact" : ""} ${styles.fullscreenCanvas}`}
              >
                {frame}
              </div>
              <p className="fine-print">
                Stäng med knappen eller Escape. Reglage i dokumentets
                demonstrationer sparas inte i planen.
              </p>
            </>
          )}
        </div>
      </Dialog>
      <Dialog
        isOpen={confirm}
        onOpenChange={closeConfirmation}
        purpose="form"
        width={520}
      >
        <DialogHeader
          title="Aktivera dokumentets JavaScript?"
          onOpenChange={closeConfirmation}
        />
        <div className="dialog-content">
          <Banner
            status="warning"
            title="Aktivera endast för dokument du litar på"
            description="Skript kan skicka data externt, bland annat genom att navigera visningsramen till andra webbplatser. Dokumentet får inte tillgång till Planrooms inloggning eller sidinnehåll."
          />
          <p>
            Valet gäller den här visningen. HTML, CSS och diagram visas även med
            skripten avstängda.
          </p>
          <div className="button-row">
            <Button label="Avbryt" onClick={() => closeConfirmation(false)} />
            <Button
              label="Aktivera interaktivitet"
              variant="primary"
              onClick={() => {
                dispatchConsent({ type: "approve", source: html });
              }}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
