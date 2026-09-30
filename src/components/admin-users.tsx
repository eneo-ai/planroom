"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Badge } from "@astryxdesign/core/Badge";
import { UserRound, UserPlus } from "lucide-react";
import { createUserSchema, type User } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { roles } from "@/client/document-format";

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("editor");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
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
        `Kontot för ${result.user.name} är skapat. Lösenordet måste bytas vid första inloggningen.`,
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
  return (
    <div className="page-stack">
      <div>
        <h2>Personer i arbetsytan</h2>
        <p className="muted">
          Alla konton delar samma arbetsyta. Läsare kan läsa, redaktörer kan
          uppdatera och administratörer kan skapa konton.
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
                  <span className="fine-print">Behöver byta startlösenord</span>
                )}
              </div>
              <Badge label={roles[user.role]} variant="neutral" />
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
    </div>
  );
}
