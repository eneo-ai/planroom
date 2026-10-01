"use client";

import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { statusSchema, type DocumentContent } from "@/contracts";
import { statusOptions } from "@/client/document-format";
import { DocumentFiles } from "./document-files";

export const emptyDocument: DocumentContent = {
  title: "",
  description: "",
  files: [],
  instructions: "",
  status: "draft",
  changeSummary: "Första versionen",
};

export function DocumentFields({
  value,
  onChange,
  showFiles = true,
  showInstructions = true,
  showStatus = true,
  isDisabled = false,
  isReadOnly = false,
}: {
  value: DocumentContent;
  onChange: (next: DocumentContent) => void;
  showFiles?: boolean;
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
      {showFiles && (
        <DocumentFiles
          files={value.files}
          onChange={(files) => change("files", files)}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
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
