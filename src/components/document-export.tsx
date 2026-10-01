"use client";

import type { ComponentProps } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Download } from "lucide-react";
import type { PlanningFileSummary } from "@/contracts";

// Astryx's custom link API keeps its button interaction/styling while using
// native download semantics, bypassing the application's navigation router.
function FileDownloadLink(props: ComponentProps<"a">) {
  return <a {...props} download />;
}

export function DocumentFileExport({
  documentId,
  file,
  hasDraft,
}: {
  documentId: string;
  file: PlanningFileSummary;
  hasDraft: boolean;
}) {
  return (
    <div className="file-export-action">
      <Button
        label={file.format === "html" ? "Ladda ner HTML" : "Ladda ner Markdown"}
        href={`/api/documents/${documentId}/export?fileId=${file.id}`}
        as={FileDownloadLink}
        icon={<Download size={16} aria-hidden />}
        tooltip={`Ladda ner den senast sparade originalfilen: ${file.name}`}
      />
      {hasDraft && (
        <span className="fine-print" role="status">
          Hämtar sparad fil. Ditt osparade utkast ingår inte.
        </span>
      )}
    </div>
  );
}
