"use client";

import { useRef, useState, type DragEvent } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Upload, FileCode2 } from "lucide-react";
import { statusSchema, type DocumentContent } from "@/contracts";
import { statusOptions } from "@/client/document-format";

export const emptyDocument: DocumentContent = {
  title: "",
  description: "",
  html: "",
  instructions: "",
  status: "draft",
  changeSummary: "Första versionen",
};

export function HtmlImport({
  onImport,
  isDisabled = false,
  onReadingChange,
}: {
  onImport: (html: string, filename: string) => void;
  isDisabled?: boolean;
  onReadingChange?: (reading: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function read(file?: File) {
    if (!file || busy || isDisabled) return;
    setError("");
    if (!/\.html?$/i.test(file.name)) {
      setError("Välj en HTML-fil med ändelsen .html eller .htm.");
      return;
    }
    if (file.size > 2_000_000) {
      setError("Filen får vara högst 2 MB.");
      return;
    }
    setBusy(true);
    onReadingChange?.(true);
    try {
      const source = await file.text();
      if (!source.trim()) throw new Error("HTML-filen är tom.");
      onImport(source, file.name.replace(/\.html?$/i, ""));
      setFilename(file.name);
    } catch {
      setError(
        "Filen kunde inte läsas. Kontrollera att den innehåller HTML och försök igen.",
      );
    } finally {
      setBusy(false);
      onReadingChange?.(false);
      if (input.current) input.current.value = "";
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void read(event.dataTransfer.files[0]);
  }
  return (
    <div className="form-stack">
      <div
        className={`import-zone ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {filename ? (
          <FileCode2 size={30} aria-hidden />
        ) : (
          <Upload size={30} aria-hidden />
        )}
        <h3>{filename || "Dra hit er HTML-planering"}</h3>
        <p className="muted">
          Layout, CSS och SVG bevaras. En fil, högst 2 MB.
        </p>
        <Button
          label={filename ? "Välj en annan HTML-fil" : "Välj HTML-fil"}
          onClick={() => input.current?.click()}
          isLoading={busy}
          isDisabled={isDisabled}
        />
        <input
          ref={input}
          type="file"
          accept=".html,.htm,text/html"
          aria-label="Välj HTML-fil"
          className="visually-hidden"
          tabIndex={-1}
          disabled={isDisabled || busy}
          onChange={(event) => void read(event.target.files?.[0])}
        />
      </div>
      {error && (
        <Banner
          status="error"
          title="Kunde inte importera filen"
          description={error}
        />
      )}
    </div>
  );
}

export function DocumentFields({
  value,
  onChange,
  showHtml = true,
  showInstructions = true,
  isDisabled = false,
}: {
  value: DocumentContent;
  onChange: (next: DocumentContent) => void;
  showHtml?: boolean;
  showInstructions?: boolean;
  isDisabled?: boolean;
}) {
  function change<K extends keyof DocumentContent>(
    key: K,
    fieldValue: DocumentContent[K],
  ) {
    onChange({ ...value, [key]: fieldValue });
  }
  return (
    <div className="form-stack">
      <div className="field-grid">
        <TextInput
          label="Titel"
          isDisabled={isDisabled}
          value={value.title}
          onChange={(next) => change("title", next)}
          isRequired
          width="100%"
          size="lg"
        />
        <Selector
          label="Status"
          isDisabled={isDisabled}
          options={statusOptions}
          value={value.status}
          onChange={(next) => change("status", statusSchema.parse(next))}
          width="100%"
          size="lg"
        />
      </div>
      <TextArea
        label="Kort beskrivning"
        isDisabled={isDisabled}
        value={value.description}
        onChange={(next) => change("description", next)}
        placeholder="Vad ska planeringen hjälpa er att genomföra?"
        rows={3}
        width="100%"
        maxLength={2000}
      />
      {showInstructions && (
        <TextArea
          label="Instruktioner och överlämning till AI"
          isDisabled={isDisabled}
          value={value.instructions}
          onChange={(next) => change("instructions", next)}
          description="Beskriv mål, begränsningar, beslut och nästa steg. Dessa instruktioner versionshanteras med planen."
          placeholder="Läs planen först. Bevara diagrammen. Fortsätt med…"
          rows={7}
          width="100%"
        />
      )}
      {showHtml && (
        <TextArea
          label="HTML-källa"
          isDisabled={isDisabled}
          value={value.html}
          onChange={(next) => change("html", next)}
          description="Hela dokumentet sparas utan att dess källa ändras. Förhandsvisningen körs separat."
          className="code-editor"
          rows={20}
          hasSpellCheck={false}
          width="100%"
          isRequired
        />
      )}
      <TextInput
        label="Vad ändras i den här versionen?"
        isDisabled={isDisabled}
        value={value.changeSummary}
        onChange={(next) => change("changeSummary", next)}
        placeholder="Exempel: Förtydligar ansvar och uppdaterar tidsplanen"
        isRequired
        width="100%"
        size="lg"
      />
    </div>
  );
}
