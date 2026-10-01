"use client";

import type { ComponentProps } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Download } from "lucide-react";

// Astryx's custom link API keeps its button interaction/styling while using
// native download semantics, bypassing the application's navigation router.
function HtmlDownloadLink(props: ComponentProps<"a">) {
  return <a {...props} download />;
}

export function DocumentHtmlExport({
  documentId,
  hasDraft,
}: {
  documentId: string;
  hasDraft: boolean;
}) {
  return (
    <div className="html-export-action">
      <Button
        label="Ladda ner HTML"
        href={`/api/documents/${documentId}/export`}
        as={HtmlDownloadLink}
        icon={<Download size={16} aria-hidden />}
        tooltip="Ladda ner planens senast sparade original-HTML"
      />
      {hasDraft && (
        <span className="fine-print" role="status">
          Hämtar sparad HTML. Ditt osparade utkast ingår inte.
        </span>
      )}
    </div>
  );
}
