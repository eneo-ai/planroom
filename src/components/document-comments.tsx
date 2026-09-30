"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { MessageSquare, Send } from "lucide-react";
import { commentSchema, type Comment } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { formatDate } from "@/client/document-format";

export function DocumentComments({
  documentId,
  canComment,
}: {
  documentId: string;
  canComment: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    setHasLoaded(false);
    try {
      setComments(
        (
          await api<{ comments: Comment[] }>(
            `/api/documents/${documentId}/comments`,
          )
        ).comments,
      );
      setHasLoaded(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [documentId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = commentSchema.safeParse({
      body,
      sectionId: sectionId.trim() || null,
    });
    if (!parsed.success) {
      setError(
        "Skriv en kommentar med högst 10 000 tecken. Avsnittets ID får vara högst 200 tecken.",
      );
      return;
    }
    setBusy(true);
    try {
      const comment = await api<Comment>(
        `/api/documents/${documentId}/comments`,
        { method: "POST", body: JSON.stringify(parsed.data) },
      );
      setComments((current) => [...current, comment]);
      setBody("");
      setSectionId("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-content page-stack">
      <div>
        <h2>Diskussion och beslut</h2>
        <p className="muted">
          Lämna sammanhang till nästa person. Beslut som ändrar planen bör även
          sparas i en ny version.
        </p>
      </div>
      {error && (
        <Banner
          status="error"
          title="Kunde inte uppdatera diskussionen"
          description={error}
          endContent={
            <Button
              label="Hämta kommentarer igen"
              onClick={() => void load()}
            />
          }
        />
      )}
      {loading ? (
        <p role="status">Hämtar kommentarer…</p>
      ) : !hasLoaded ? null : comments.length === 0 ? (
        <div className="quiet-empty">
          <MessageSquare size={24} aria-hidden />
          <p>Ingen diskussion ännu. Här finns plats för nästa beslut.</p>
        </div>
      ) : (
        <ol className="comment-list">
          {comments.map((comment) => (
            <li key={comment.id}>
              <article>
                <div className="comment-heading">
                  <strong>{comment.authorName}</strong>
                  <time dateTime={comment.createdAt} className="muted">
                    {formatDate(comment.createdAt)}
                  </time>
                </div>
                {comment.sectionId && (
                  <p className="section-caption">
                    Avsnitt: #{comment.sectionId}
                  </p>
                )}
                <p className="preserve-lines">{comment.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
      {canComment && (
        <form onSubmit={submit} className="form-stack">
          <TextArea
            label="Din kommentar"
            value={body}
            onChange={setBody}
            rows={4}
            width="100%"
            maxLength={10_000}
            placeholder="Beslut, frågor eller något nästa person behöver veta…"
            isRequired
          />
          <TextInput
            label="Avsnittets ID (valfritt)"
            description="Knyt kommentaren till ett avsnitt i HTML-dokumentet, till exempel arkitektur."
            value={sectionId}
            onChange={setSectionId}
            width="100%"
          />
          <div>
            <Button
              label="Publicera kommentar"
              type="submit"
              variant="primary"
              isLoading={busy}
              isDisabled={!body.trim()}
              icon={<Send size={16} aria-hidden />}
            />
          </div>
        </form>
      )}
    </div>
  );
}
