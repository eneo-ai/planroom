"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import type { SharedDocument } from "@/contracts";
import { api, ApiError, errorMessage } from "@/client/api";
import { SharedDocumentView } from "@/components/shared-document";

export default function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  return <SharedDocumentContent key={token} token={token} />;
}
function SharedDocumentContent({ token }: { token: string }) {
  const [document, setDocument] = useState<SharedDocument | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDocument(null);
    setError("");
    void api<SharedDocument>(`/api/shared/${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then((current) => {
        if (!controller.signal.aborted) setDocument(current);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof ApiError &&
              (cause.status === 404 || cause.status === 400)
              ? "Länken är ogiltig eller har stängts av. Be den som delade planeringen om en aktuell länk."
              : errorMessage(cause),
          );
      });
    return () => controller.abort();
  }, [token, reload]);
  return (
    <div className="page-stack">
      {error ? (
        <Banner
          status="error"
          title="Planeringen kunde inte öppnas"
          description={error}
          endContent={
            <Button
              label="Försök igen"
              onClick={() => setReload((value) => value + 1)}
            />
          }
        />
      ) : document ? (
        <SharedDocumentView document={document} />
      ) : (
        <p role="status">Hämtar planering…</p>
      )}
    </div>
  );
}
