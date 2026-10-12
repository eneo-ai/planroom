"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Badge } from "@astryxdesign/core/Badge";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { UserRound, UserPlus, KeyRound, Copy } from "lucide-react";
import { createUserSchema, type PasswordReset, type User } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { roles } from "@/client/document-format";

type ResetState = { user: User } & (
  | { status: "confirm" | "saving" }
  | { status: "complete"; result: PasswordReset }
  | { status: "error"; message: string }
);

export function AdminUsers({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState<ResetState | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    setHasLoaded(false);
    try {
      setUsers((await api<{ users: User[] }>("/api/admin/users")).users);
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
    if (busy) return;
    setError("");
    setNotice("");
    const parsed = createUserSchema.safeParse({ name, email, password, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: User }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setUsers((current) => [...current, result.user]);
      setNotice(
        `Kontot för ${result.user.name} är skapat. Lösenordet måste bytas vid första inloggningen. Lägg sedan till personen i rätt team.`,
      );
      setName("");
      setEmail("");
      setPassword("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (busy || reset?.status !== "confirm") return;
    const target = reset.user;
    setBusy(true);
    setReset({ user: target, status: "saving" });
    try {
      const result = await api<PasswordReset>(
        `/api/admin/users/${target.id}/reset-password`,
        { method: "POST" },
      );
      setUsers((current) =>
        current.map((user) =>
          user.id === result.user.id ? result.user : user,
        ),
      );
      setReset({ user: result.user, status: "complete", result });
    } catch (cause) {
      // A lost response may follow a committed reset. A fresh confirmation is
      // required; never retry automatically or suggest the old password works.
      setReset({ user: target, status: "error", message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }
  function closeReset() {
    if (busy) return;
    setReset(null);
    setCopyNotice("");
  }
  async function copyPassword() {
    if (reset?.status !== "complete") return;
    try {
      await navigator.clipboard.writeText(reset.result.temporaryPassword);
      setCopyNotice("Lösenordet har kopierats.");
    } catch {
      setCopyNotice(
        "Lösenordet kunde inte kopieras. Markera och kopiera det i fältet.",
      );
    }
  }
  return (
    <div className="page-stack">
      <div>
        <h2>Konton i installationen</h2>
        <p className="muted">
          Globaladmin hanterar installationen och har åtkomst till alla team.
          Övriga konton får åtkomst genom medlemskap och en roll i respektive
          team.
        </p>
      </div>
      {error && (
        <Banner
          status="error"
          title="Kontona kunde inte uppdateras"
          description={error}
          endContent={
            <Button label="Hämta konton igen" onClick={() => void load()} />
          }
        />
      )}
      {notice && <Banner status="success" title={notice} />}
      {loading ? (
        <p role="status">Hämtar personer…</p>
      ) : !hasLoaded ? null : (
        <ul className="settings-list">
          {users.map((user) => (
            <li key={user.id}>
              <UserRound size={20} aria-hidden />
              <div>
                <strong>{user.name}</strong>
                <p className="muted">{user.email}</p>
                {user.mustChangePassword && (
                  <span className="fine-print">Behöver byta lösenord</span>
                )}
              </div>
              <Badge label={roles[user.role]} variant="neutral" />
              {user.id !== currentUserId && (
                <Button
                  label="Återställ lösenord"
                  aria-label={`Återställ lösenord för ${user.name}`}
                  size="sm"
                  icon={<KeyRound size={16} aria-hidden />}
                  isDisabled={busy}
                  onClick={() => {
                    setCopyNotice("");
                    setReset({ user, status: "confirm" });
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <section className="narrow-content page-stack">
        <div>
          <h3>Lägg till en person</h3>
          <p className="muted">
            Överlämna startlösenordet på ett säkert sätt. Personen väljer ett
            eget lösenord vid första inloggningen.
          </p>
        </div>
        <form className="form-stack" onSubmit={create}>
          <TextInput
            label="Namn"
            value={name}
            onChange={setName}
            width="100%"
            isRequired
            size="lg"
          />
          <TextInput
            label="E-postadress"
            type="email"
            value={email}
            onChange={setEmail}
            width="100%"
            isRequired
            size="lg"
          />
          <TextInput
            label="Tillfälligt lösenord"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            description="Minst 12 tecken."
            width="100%"
            isRequired
            size="lg"
          />
          <Selector
            label="Roll"
            value={role}
            onChange={setRole}
            options={Object.entries(roles).map(([value, label]) => ({
              value,
              label,
            }))}
            width="100%"
            size="lg"
          />
          <div>
            <Button
              label="Skapa konto"
              type="submit"
              variant="primary"
              isLoading={busy}
              icon={<UserPlus size={16} aria-hidden />}
            />
          </div>
        </form>
      </section>
      <Dialog
        isOpen={reset !== null}
        onOpenChange={(open) => {
          if (!open) closeReset();
        }}
        purpose="form"
        width={560}
      >
        <DialogHeader
          title={
            reset?.status === "complete"
              ? "Nytt engångslösenord"
              : "Återställ lösenord?"
          }
        />
        {reset && (
          <div className="dialog-content page-stack">
            <p>
              <strong>{reset.user.name}</strong>
              <br />
              {reset.user.email}
            </p>
            {reset.status === "complete" ? (
              <>
                <p>
                  Lösenordet visas bara här. Överlämna det till användaren innan
                  du stänger dialogen. Det kan användas för en inloggning och
                  måste sedan bytas.
                </p>
                <TextInput
                  label="Engångslösenord"
                  value={reset.result.temporaryPassword}
                  isReadOnly
                  autoComplete="off"
                  width="100%"
                />
                <p className="fine-print">
                  Giltigt till{" "}
                  <time dateTime={reset.result.expiresAt}>
                    {new Date(reset.result.expiresAt).toLocaleString("sv-SE")}
                  </time>
                  . Tidigare sessioner och API-nycklar har återkallats.
                </p>
                {copyNotice && <p role="status">{copyNotice}</p>}
                <div className="button-row">
                  <Button
                    label="Kopiera lösenord"
                    icon={<Copy size={16} aria-hidden />}
                    onClick={() => void copyPassword()}
                  />
                  <Button
                    label="Klart"
                    variant="primary"
                    onClick={closeReset}
                  />
                </div>
              </>
            ) : reset.status === "error" ? (
              <>
                <Banner
                  status="error"
                  title="Återställningen kunde inte bekräftas"
                  description={reset.message}
                />
                <p>
                  Lösenordet kan redan ha ändrats. Stäng dialogen och starta en
                  ny återställning om du inte har fått ett nytt engångslösenord.
                </p>
                <Button label="Stäng" onClick={closeReset} />
              </>
            ) : (
              <>
                <p>
                  Ett nytt engångslösenord genereras och gäller i 24 timmar. Det
                  gamla lösenordet slutar fungera, alla sessioner avslutas och
                  användarens API-nycklar återkallas. Användaren måste välja ett
                  nytt lösenord före åtkomst till arbetsytan.
                </p>
                <div className="button-row">
                  <Button
                    label="Avbryt"
                    isDisabled={busy}
                    onClick={closeReset}
                  />
                  <Button
                    label="Generera engångslösenord"
                    variant="primary"
                    isLoading={busy}
                    onClick={() => void resetPassword()}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
