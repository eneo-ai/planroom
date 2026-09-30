"use client";

import { useState, type FormEvent } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { setupSchema, type User } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { useSession } from "./session";

export function AccountForm({ onSaved }: { onSaved?: () => void }) {
  const { user, setUser } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const parsed = setupSchema.safeParse({
      name,
      email,
      currentPassword,
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (password !== confirmation) {
      setError("De nya lösenorden matchar inte.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: User }>("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setUser(result.user);
      setPassword("");
      setConfirmation("");
      setCurrentPassword("");
      setSaved(true);
      onSaved?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      {error && (
        <Banner
          status="error"
          title="Kontot kunde inte uppdateras"
          description={error}
        />
      )}
      {saved && (
        <Banner
          status="success"
          title="Ditt konto är uppdaterat"
          description="Tidigare sessioner har avslutats."
        />
      )}
      <TextInput
        label="Namn"
        value={name}
        onChange={setName}
        isRequired
        autoComplete="name"
        size="lg"
        width="100%"
      />
      <TextInput
        label="E-postadress"
        type="email"
        value={email}
        onChange={setEmail}
        isRequired
        autoComplete="email"
        size="lg"
        width="100%"
      />
      <TextInput
        label="Nuvarande lösenord"
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
        isRequired
        autoComplete="current-password"
        size="lg"
        width="100%"
      />
      <TextInput
        label="Nytt lösenord"
        type="password"
        value={password}
        onChange={setPassword}
        description="Minst 12 tecken. Använd ett unikt lösenord."
        isRequired
        autoComplete="new-password"
        size="lg"
        width="100%"
      />
      <TextInput
        label="Bekräfta nytt lösenord"
        type="password"
        value={confirmation}
        onChange={setConfirmation}
        isRequired
        autoComplete="new-password"
        size="lg"
        width="100%"
      />
      <Button
        label={user?.mustChangePassword ? "Aktivera mitt konto" : "Spara konto"}
        variant="primary"
        type="submit"
        isLoading={busy}
      />
    </form>
  );
}
