"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import type { SharedDocument } from "@/contracts";
import { api, ApiError, errorMessage } from "@/client/api";
import { SharedDocumentView } from "@/components/shared-document";

export default function SharedDocumentPage() {
  const { token, id } = useParams<{ token: string; id: string }>();
  return <SharedDocumentContent key={`${token}:${id}`} token={token} id={id} />;
}
function SharedDocumentContent({ token, id }: { token: string; id: string }) {
  const [document, setDocument] = useState<SharedDocument | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDocument(null);
    setError("");
    void api<SharedDocument>(
      `/api/shared/${encodeURIComponent(token)}/documents/${encodeURIComponent(id)}`,
      { signal: controller.signal },
    )
      .then((current) => {
        if (!controller.signal.aborted) setDocument(current);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof ApiError &&
              (cause.status === 404 || cause.status === 400)
              ? "Uppgiften finns inte i det delade projektet, eller så har länken stängts av."
              : errorMessage(cause),
          );
      });
    return () => controller.abort();
  }, [token, id, reload]);
  return (
    <div className="page-stack">
      <Link href={`/shared/${encodeURIComponent(token)}`} isStandalone>
        Tillbaka till projektet
      </Link>
      {error ? (
        <Banner
          status="error"
          title="Uppgiften kunde inte öppnas"
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
        <p role="status">Hämtar uppgift…</p>
      )}
    </div>
  );
}
