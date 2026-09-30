"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Banner } from "@astryxdesign/core/Banner";
import { Layers3, ArrowRight, Link2, History, Bot } from "lucide-react";
import { api, errorMessage } from "@/client/api";
import { loginSchema, type User } from "@/contracts";
import { useSession } from "@/components/session";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { setUser } = useSession();
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Ange en giltig e-postadress och ditt lösenord.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setUser(result.user);
      router.replace(result.user.mustChangePassword ? "/setup" : "/");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <Layers3 size={28} aria-hidden />
          <span>Planroom</span>
        </div>
        <div>
          <p className="eyebrow">PLANERA TILLSAMMANS</p>
          <h1>
            Från bilaga
            <br />
            till gemensam plan.
          </h1>
          <p className="story-description">
            Ge era idéer en plats att utvecklas. Samma länk, hela historiken och
            rätt kontext för nästa steg.
          </p>
        </div>
        <div className="story-features">
          <span>
            <Link2 size={18} aria-hidden /> En fast länk
          </span>
          <span>
            <History size={18} aria-hidden /> Spårbara ändringar
          </span>
          <span>
            <Bot size={18} aria-hidden /> Redo för AI
          </span>
        </div>
      </section>
      <section className="auth-form-area">
        <Card padding={8} className="auth-card">
          <p className="eyebrow">DIN ARBETSYTA</p>
          <h2>Välkommen tillbaka</h2>
          <p className="muted">Logga in för att fortsätta planeringen.</p>
          <form className="form-stack" onSubmit={submit}>
            {error && (
              <Banner
                status="error"
                title="Kunde inte logga in"
                description={error}
              />
            )}
            <TextInput
              label="E-postadress"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
              isRequired
              width="100%"
              size="lg"
            />
            <TextInput
              label="Lösenord"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              isRequired
              width="100%"
              size="lg"
            />
            <Button
              label="Logga in"
              variant="primary"
              type="submit"
              isLoading={busy}
              width="100%"
              icon={<ArrowRight size={18} aria-hidden />}
            />
          </form>
          <p className="fine-print">
            Efter fem misslyckade inloggningsförsök spärras nya försök i tio
            minuter. Försök igen när spärren har gått ut.
          </p>
          <p className="fine-print">
            Första gången? Använd startkontot som konfigurerats av
            administratören. Du får sedan välja dina egna uppgifter.
          </p>
        </Card>
      </section>
    </main>
  );
}
