"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { UsersRound } from "lucide-react";
import { namedEntityInputSchema, teamRoleLabels, type Team } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { useSession } from "@/components/session";

export default function TeamsPage() {
  const { user } = useSession();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ teams: Team[] }>("/api/teams", { signal: controller.signal })
      .then((result) => setTeams(result.teams))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = namedEntityInputSchema.safeParse({ name, description });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const team = await api<Team>("/api/teams", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setTeams((current) => [...current, team]);
      setName("");
      setDescription("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">TEAM OCH PROJEKT</p>
          <h1>{user?.role === "global_admin" ? "Alla team" : "Mina team"}</h1>
          <p className="muted">
            Öppna ett team för att se dess projekt och planeringar.
          </p>
        </div>
      </header>
      {user?.role === "global_admin" && (
        <Banner
          status="info"
          title="Globaladmin"
          description="Du har överblick och åtkomst till alla team. Andra användare ser endast sina team."
        />
      )}
      {error && (
        <Banner
          status="error"
          title="Team kunde inte hämtas eller sparas"
          description={error}
        />
      )}
      {loading ? (
        <p role="status">Hämtar team…</p>
      ) : teams.length === 0 ? (
        <EmptyState
          title="Du är inte medlem i något team"
          description="Be en teamägare eller globaladmin att lägga till dig."
          icon={<UsersRound size={24} aria-hidden />}
        />
      ) : (
        <div className="document-grid">
          {teams.map((team) => (
            <ClickableCard
              key={team.id}
              label={team.name}
              href={`/teams/${team.id}`}
              padding={6}
            >
              <h2>{team.name}</h2>
              <p className="muted">
                {team.description || "Projekt och gemensam planering."}
              </p>
              <p className="fine-print">{teamRoleLabels[team.role]}</p>
            </ClickableCard>
          ))}
        </div>
      )}
      {user?.role === "global_admin" && (
        <section className="narrow-content page-stack">
          <h2>Skapa team</h2>
          <form className="form-stack" onSubmit={create}>
            <TextInput
              label="Teamnamn"
              value={name}
              onChange={setName}
              isRequired
              width="100%"
              isDisabled={busy}
            />
            <TextArea
              label="Beskrivning"
              value={description}
              onChange={setDescription}
              rows={3}
              width="100%"
              isDisabled={busy}
            />
            <Button
              label="Skapa team"
              type="submit"
              variant="primary"
              isLoading={busy}
            />
          </form>
        </section>
      )}
    </div>
  );
}
