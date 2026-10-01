"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Plus, Trash2 } from "lucide-react";
import {
  maxPlanningFiles,
  maxPlanningSourceLength,
  type PlanningFile,
  type PlanningFileFormat,
} from "@/contracts";
import { readPlanningFiles } from "@/client/planning-files";

export function PlanningFileImport({
  files,
  onImport,
  isDisabled = false,
  onReadingChange,
}: {
  files: PlanningFile[];
  onImport: (files: PlanningFile[]) => void;
  isDisabled?: boolean;
  onReadingChange?: (reading: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  async function read(selected: File[]) {
    if (busy || isDisabled) return;
    setError("");
    setBusy(true);
    onReadingChange?.(true);
    try {
      onImport(await readPlanningFiles(selected, files));
      setSelection(selected);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Filerna kunde inte läsas. Försök igen.",
      );
    } finally {
      setBusy(false);
      onReadingChange?.(false);
    }
  }
  return (
    <FileInput
      label="Lägg till planeringsfiler"
      mode="dropzone"
      isMultiple
      value={selection}
      onChange={(next) => {
        if (busy || isDisabled) return;
        const selected = Array.isArray(next) ? next : next ? [next] : [];
        if (selected.length) void read(selected);
        else setSelection([]);
      }}
      accept=".html,.htm,.md,.markdown"
      maxSize={maxPlanningSourceLength}
      maxFiles={maxPlanningFiles}
      isDisabled={isDisabled || busy}
      isLoading={busy}
      placeholder="Dra hit HTML- och Markdown-filer eller välj filer"
      description="Blanda format på samma kort. Högst 20 filer och 2 000 000 källtecken totalt; högst 2 MB per import. Originalkällorna bevaras. Att rensa filvalet tar inte bort importerade filer."
      status={error ? { type: "error", message: error } : undefined}
      width="100%"
    />
  );
}

export function DocumentFiles({
  files,
  onChange,
  isDisabled = false,
  isReadOnly = false,
}: {
  files: PlanningFile[];
  onChange: (files: PlanningFile[]) => void;
  isDisabled?: boolean;
  isReadOnly?: boolean;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const selected = files.find((file) => file.id === selectedId) ?? files[0];
  const removing = files.find((file) => file.id === removingId);
  function update(change: Partial<Pick<PlanningFile, "name" | "content">>) {
    if (!selected || isReadOnly || isDisabled) return;
    onChange(
      files.map((file) =>
        file.id === selected.id ? { ...file, ...change } : file,
      ),
    );
  }
  function add(format: PlanningFileFormat) {
    const extension = format === "html" ? "html" : "md";
    let number = 1;
    while (
      files.some(
        (file) =>
          file.name.toLowerCase() === `planering-${number}.${extension}`,
      )
    )
      number++;
    const id = crypto.randomUUID();
    onChange([
      ...files,
      { id, name: `planering-${number}.${extension}`, format, content: "" },
    ]);
    setSelectedId(id);
  }
  return (
    <section className="form-stack" aria-label="Planeringsfiler">
      <div className="button-row">
        <h2>Planeringsfiler ({files.length})</h2>
        {!isReadOnly && (
          <>
            <Button
              label="Ny Markdown-fil"
              icon={<Plus size={16} aria-hidden />}
              isDisabled={isDisabled || files.length >= maxPlanningFiles}
              onClick={() => add("markdown")}
            />
            <Button
              label="Ny HTML-fil"
              icon={<Plus size={16} aria-hidden />}
              isDisabled={isDisabled || files.length >= maxPlanningFiles}
              onClick={() => add("html")}
            />
          </>
        )}
      </div>
      {selected ? (
        <>
          <Selector
            label="Fil att redigera"
            options={files.map((file) => ({
              value: file.id,
              label: file.name || "Namnlös fil",
            }))}
            value={selected.id}
            onChange={setSelectedId}
            width="100%"
          />
          <div className="button-row">
            <TextInput
              label="Filnamn"
              value={selected.name}
              onChange={(name) => update({ name })}
              isDisabled={isDisabled}
              isReadOnly={isReadOnly}
              isRequired
              width="100%"
            />
            {!isReadOnly && (
              <Button
                label="Ta bort fil"
                variant="destructive"
                icon={<Trash2 size={16} aria-hidden />}
                isDisabled={isDisabled}
                onClick={() => setRemovingId(selected.id)}
              />
            )}
          </div>
          <TextArea
            label={selected.format === "html" ? "HTML-källa" : "Markdown-källa"}
            value={selected.content}
            onChange={(content) => update({ content })}
            isDisabled={isDisabled}
            isReadOnly={isReadOnly}
            rows={20}
            hasSpellCheck={false}
            className="code-editor"
            width="100%"
            isRequired
            maxLength={maxPlanningSourceLength}
            description="Hela källan sparas utan ändringar. Alla filer följer planeringens versioner och statuslås."
          />
        </>
      ) : (
        <p className="muted">
          Importera filer eller skapa en HTML- eller Markdown-fil.
        </p>
      )}
      <Dialog
        isOpen={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemovingId(null);
        }}
        purpose="form"
        width={480}
      >
        <DialogHeader
          title="Ta bort filen från nästa version?"
          onOpenChange={(open) => {
            if (!open) setRemovingId(null);
          }}
        />
        <div className="dialog-content">
          <p>
            {removing?.name} tas bort från utkastet. Sparade versioner behåller
            filen. Planeringen behöver minst en fil för att sparas.
          </p>
          <div className="button-row">
            <Button label="Behåll filen" onClick={() => setRemovingId(null)} />
            <Button
              label="Ta bort från utkastet"
              variant="destructive"
              isDisabled={isDisabled || isReadOnly}
              onClick={() => {
                onChange(files.filter((file) => file.id !== removingId));
                setRemovingId(null);
              }}
            />
          </div>
        </div>
      </Dialog>
    </section>
  );
}
