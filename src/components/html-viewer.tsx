"use client";

import { useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { ShieldCheck, Play, Monitor, Smartphone } from "lucide-react";
import { htmlPreview } from "@/client/html-preview";

export function HtmlViewer({ html, title }: { html: string; title: string }) {
  const [interactiveSource, setInteractiveSource] = useState<string | null>(
    null,
  );
  const interactive = interactiveSource === html;
  const [confirm, setConfirm] = useState(false);
  const [compact, setCompact] = useState(false);
  const source = useMemo(
    () => htmlPreview(html, interactive),
    [html, interactive],
  );
  return (
    <div className="viewer">
      <div className="viewer-toolbar">
        <span className="viewer-security">
          <ShieldCheck size={16} aria-hidden />
          {interactive ? "Interaktivitet aktiverad" : "Skyddad visning"}
        </span>
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
              interactive
                ? "Stäng av interaktivitet"
                : "Aktivera interaktivitet"
            }
            size="sm"
            variant="secondary"
            icon={<Play size={14} aria-hidden />}
            onClick={() =>
              interactive ? setInteractiveSource(null) : setConfirm(true)
            }
          />
        </div>
      </div>
      <div className={`viewer-canvas ${compact ? "compact" : ""}`}>
        <iframe
          key={interactive ? "interactive" : "protected"}
          title={`Förhandsvisning: ${title}`}
          srcDoc={source}
          sandbox={interactive ? "allow-scripts" : ""}
          referrerPolicy="no-referrer"
          className="html-frame"
        />
      </div>
      <p className="fine-print">
        Externa resurser, inklusive typsnitt och skript, blockeras. Reglage i
        planens demonstrationer sparas inte som beslut eller uppgiftsstatus.
      </p>
      <Dialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        purpose="form"
        width={520}
      >
        <DialogHeader
          title="Aktivera dokumentets JavaScript?"
          onOpenChange={setConfirm}
        />
        <div className="dialog-content">
          <Banner
            status="warning"
            title="Aktivera endast för dokument du litar på"
            description="Skript kan navigera visningsramen till andra webbplatser och därigenom skicka data externt. Dokumentet får inte tillgång till Planrooms inloggning eller sidinnehåll."
          />
          <p>
            Valet gäller den här visningen. HTML, CSS och diagram visas även med
            skripten avstängda.
          </p>
          <div className="button-row">
            <Button label="Avbryt" onClick={() => setConfirm(false)} />
            <Button
              label="Aktivera interaktivitet"
              variant="primary"
              onClick={() => {
                setInteractiveSource(html);
                setConfirm(false);
              }}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
