"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { KeyRound, Plus, Copy, Trash2 } from "lucide-react";
import { createTokenSchema, type ApiToken } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { formatDate } from "@/client/document-format";
import { useSession } from "./session";
import { McpGuide } from "./mcp-guide";

export function ApiTokens() {
  const { user } = useSession();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("read");
  const [secret, setSecret] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);
  const [revoke, setRevoke] = useState<ApiToken | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setHasLoaded(false);
    setError("");
    try {
      setTokens((await api<{ tokens: ApiToken[] }>("/api/tokens")).tokens);
      setHasLoaded(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = createTokenSchema.safeParse({ name, scope });
    if (!parsed.success) {
      setError("Ge åtkomstnyckeln ett namn med högst 100 tecken.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ token: string; record: ApiToken }>(
        "/api/tokens",
        { method: "POST", body: JSON.stringify(parsed.data) },
      );
      setTokens((current) => [result.record, ...current]);
      setSecret({ token: result.token, expiresAt: result.record.expiresAt });
      setCopied(false);
      setName("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!revoke) return;
    setError("");
    setBusy(true);
    try {
      await api(`/api/tokens/${revoke.id}`, { method: "DELETE" });
      setTokens((current) => current.filter((token) => token.id !== revoke.id));
      setRevoke(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.token);
      setCopied(true);
    } catch {
      setError(
        "Nyckeln kunde inte kopieras. Markera och kopiera den manuellt.",
      );
    }
  }
  return (
    <div className="page-stack">
      <div>
        <h2>1. Skapa en personlig åtkomstnyckel</h2>
        <p className="muted">
          Ge nyckeln ett namn för den AI-klient du ska ansluta. Välj endast
          läsning för att granska planer eller läsning och uppdatering för att
          även spara ändringar. Kopiera nyckeln när den visas och spara den
          säkert. Nyckeln gäller i 90 dagar. Skapa en ny och byt nyckeln i
          klienten innan den gamla går ut.
        </p>
      </div>
      {error && (
        <Banner
          status="error"
          title="Åtkomstnycklarna kunde inte uppdateras"
          description={error}
          endContent={
            <Button label="Hämta nycklar igen" onClick={() => void load()} />
          }
        />
      )}
      <form onSubmit={create} className="token-create">
        <TextInput
          label="Namn på åtkomstnyckel"
          value={name}
          onChange={setName}
          placeholder="Till exempel Claude på arbetsdatorn"
          width="100%"
          isRequired
          size="lg"
        />
        <Selector
          label="Behörighet"
          value={scope}
          onChange={setScope}
          options={[
            { value: "read", label: "Läsa planeringar" },
            ...(user?.role !== "viewer"
              ? [{ value: "write", label: "Läsa och uppdatera" }]
              : []),
          ]}
          width="100%"
          size="lg"
        />
        <Button
          label="Skapa nyckel"
          type="submit"
          variant="primary"
          isLoading={busy}
          icon={<Plus size={16} aria-hidden />}
        />
      </form>
      <p className="fine-print">
        En nyckel ger aldrig större behörighet än ditt konto. Använd en separat
        nyckel per klient och återkalla den när den inte längre behövs.
      </p>
      {loading ? (
        <p role="status">Hämtar åtkomstnycklar…</p>
      ) : !hasLoaded ? null : tokens.length === 0 ? (
        <EmptyState
          title="Du har inga åtkomstnycklar ännu"
          icon={<KeyRound size={24} aria-hidden />}
          isCompact
        />
      ) : (
        <ul className="settings-list">
          {tokens.map((token) => (
            <li key={token.id}>
              <KeyRound size={19} aria-hidden />
              <div>
                <strong>{token.name}</strong>
                <p>
                  {token.maskedToken ? (
                    <code
                      aria-label={`Nyckel som slutar på ${token.maskedToken.slice(-4)}`}
                    >
                      {token.maskedToken}
                    </code>
                  ) : (
                    <span className="muted">
                      Äldre nyckel · identifierare saknas
                    </span>
                  )}
                </p>
                <p className="muted">
                  {Date.parse(token.expiresAt) <= Date.now()
                    ? "Utgången sedan "
                    : "Giltig till "}
                  <time dateTime={token.expiresAt}>
                    {formatDate(token.expiresAt)}
                  </time>
                </p>
                <p className="muted">
                  {token.scope === "write"
                    ? "Läsa och uppdatera"
                    : "Endast läsa"}{" "}
                  · Skapad {formatDate(token.createdAt)}
                </p>
                <p className="muted">
                  Senast använd:{" "}
                  {token.lastUsedAt
                    ? formatDate(token.lastUsedAt)
                    : "Inte använd ännu"}
                </p>
              </div>
              <Button
                label={`Återkalla ${token.name}`}
                size="sm"
                variant="ghost"
                icon={<Trash2 size={16} aria-hidden />}
                onClick={() => setRevoke(token)}
              />
            </li>
          ))}
        </ul>
      )}
      <McpGuide />
      <Dialog
        isOpen={secret !== null}
        onOpenChange={(open) => {
          if (!open) setSecret(null);
        }}
        width={620}
        purpose="form"
      >
        <DialogHeader title="Spara din åtkomstnyckel" />
        <div className="dialog-content">
          <Banner
            status="warning"
            title="Nyckeln visas bara den här gången"
            description="Spara den i klientens säkra inställningar eller en lösenordshanterare. Den kan inte hämtas igen när du stänger den här rutan."
          />
          <TextArea
            label="Åtkomstnyckel"
            value={secret?.token ?? ""}
            isReadOnly
            rows={3}
            width="100%"
            hasSpellCheck={false}
            className="code-editor"
          />
          {secret && (
            <p>
              Giltig till{" "}
              <time dateTime={secret.expiresAt}>
                {formatDate(secret.expiresAt)}
              </time>
              . Spara datumet tillsammans med nyckeln. Skapa en ny nyckel och
              uppdatera klientens inställningar före detta datum; förnyelse sker
              manuellt.
            </p>
          )}
          {error && (
            <Banner
              status="error"
              title="Kopiering misslyckades"
              description={error}
            />
          )}
          <div className="button-row">
            <Button
              label={copied ? "Kopierad" : "Kopiera nyckel"}
              icon={<Copy size={16} aria-hidden />}
              onClick={() => void copy()}
            />
            <Button
              label="Jag har sparat nyckeln"
              variant="primary"
              onClick={() => setSecret(null)}
            />
          </div>
        </div>
      </Dialog>
      <Dialog
        isOpen={revoke !== null}
        onOpenChange={(open) => {
          if (!open) setRevoke(null);
        }}
        width={500}
        purpose="form"
      >
        <DialogHeader
          title="Återkalla åtkomstnyckeln?"
          onOpenChange={(open) => {
            if (!open) setRevoke(null);
          }}
        />
        <div className="dialog-content">
          <p>
            Klienter som använder <strong>{revoke?.name}</strong> förlorar sin
            åtkomst direkt. Du kan skapa en ny nyckel senare.
            {revoke?.maskedToken && (
              <>
                {" "}
                Nyckel: <code>{revoke.maskedToken}</code>.
              </>
            )}
          </p>
          {error && (
            <Banner
              status="error"
              title="Kunde inte återkalla"
              description={error}
            />
          )}
          <div className="button-row">
            <Button label="Avbryt" onClick={() => setRevoke(null)} />
            <Button
              label="Återkalla nyckel"
              variant="destructive"
              isLoading={busy}
              onClick={() => void remove()}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
