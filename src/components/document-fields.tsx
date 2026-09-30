"use client";

import { useState } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { FileInput } from "@astryxdesign/core/FileInput";
import { statusSchema, type DocumentContent } from "@/contracts";
import { statusOptions } from "@/client/document-format";

const maxHtmlBytes = 2_000_000;

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
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function read(selectedFile: File) {
    if (busy || isDisabled) return;
    setError("");
    if (!/\.html?$/i.test(selectedFile.name)) {
      setError("Välj en HTML-fil med ändelsen .html eller .htm.");
      return;
    }
    if (selectedFile.size > maxHtmlBytes) {
      setError("Filen får vara högst 2 MB.");
      return;
    }
    setBusy(true);
    onReadingChange?.(true);
    try {
      const source = await selectedFile.text();
      if (!source.trim()) throw new Error("HTML-filen är tom.");
      onImport(source, selectedFile.name.replace(/\.html?$/i, ""));
      setFile(selectedFile);
    } catch {
      setError(
        "Filen kunde inte läsas. Kontrollera att den innehåller HTML och försök igen.",
      );
    } finally {
      setBusy(false);
      onReadingChange?.(false);
    }
  }
  return (
    <FileInput
      label="Importera HTML-planering"
      mode="dropzone"
      value={file}
      onChange={(files) => {
        if (busy || isDisabled) return;
        setError("");
        const selectedFile = Array.isArray(files) ? files[0] : files;
        if (selectedFile) void read(selectedFile);
        else setFile(null);
      }}
      accept=".html,.htm"
      maxSize={maxHtmlBytes}
      isDisabled={isDisabled || busy}
      isLoading={busy}
      placeholder="Dra hit en HTML-fil eller välj fil"
      description="Layout, CSS och SVG bevaras. En fil, högst 2 MB. Att rensa filvalet ändrar inte importerad HTML."
      status={error ? { type: "error", message: error } : undefined}
      width="100%"
    />
  );
}

export function DocumentFields({
  value,
  onChange,
  showHtml = true,
  showInstructions = true,
  showStatus = true,
  isDisabled = false,
  isReadOnly = false,
}: {
  value: DocumentContent;
  onChange: (next: DocumentContent) => void;
  showHtml?: boolean;
  showInstructions?: boolean;
  showStatus?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
}) {
  function change<K extends keyof DocumentContent>(
    key: K,
    fieldValue: DocumentContent[K],
  ) {
    onChange({ ...value, [key]: fieldValue });
  }
  return (
    <div className="form-stack">
      <div className={showStatus ? "field-grid" : undefined}>
        <TextInput
          label="Titel"
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          value={value.title}
          onChange={(next) => change("title", next)}
          isRequired
          width="100%"
          size="lg"
        />
        {showStatus && (
          <Selector
            label="Status"
            isDisabled={isDisabled}
            isReadOnly={isReadOnly}
            options={statusOptions}
            value={value.status}
            onChange={(next) => change("status", statusSchema.parse(next))}
            width="100%"
            size="lg"
          />
        )}
      </div>
      <TextArea
        label="Kort beskrivning"
        isDisabled={isDisabled}
        isReadOnly={isReadOnly}
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
          isReadOnly={isReadOnly}
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
          isReadOnly={isReadOnly}
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
        isReadOnly={isReadOnly}
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
