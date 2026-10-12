"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Link } from "@astryxdesign/core/Link";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  createProjectSchema,
  setTeamMemberSchema,
  updateNamedEntitySchema,
  canWriteTeam,
  teamRoleLabels,
  type Team,
  type Project,
  type TeamMember,
} from "@/contracts";
import { api, errorMessage } from "@/client/api";

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const current = await api<Team>(`/api/teams/${id}`, { signal });
        const projectResult = await api<{ projects: Project[] }>(
          `/api/projects?teamId=${id}`,
          { signal },
        );
        const memberResult =
          current.role === "owner"
            ? await api<{ members: TeamMember[] }>(`/api/teams/${id}/members`, {
                signal,
              })
            : { members: [] };
        if (signal?.aborted) return;
        setTeam(current);
        setTeamName(current.name);
        setTeamDescription(current.description);
        setProjects(projectResult.projects);
        setMembers(memberResult.members);
      } catch (cause) {
        if (!signal?.aborted) {
          setTeam(null);
          setProjects([]);
          setMembers([]);
          setError(errorMessage(cause));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    const parsed = createProjectSchema.safeParse({
      teamId: id,
      name,
      description,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setProjects((current) => [...current, project]);
      setName("");
      setDescription("");
      setNotice("Projektet har skapats.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!team) return;
    const parsed = updateNamedEntitySchema.safeParse({
      name: teamName,
      description: teamDescription,
      expectedVersion: team.version,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setTeam(
        await api<Team>(`/api/teams/${id}`, {
          method: "PUT",
          body: JSON.stringify(parsed.data),
        }),
      );
      setNotice("Teamet har sparats.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveMember(event: FormEvent) {
    event.preventDefault();
    const parsed = setTeamMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/teams/${id}/members`, {
        method: "PUT",
        body: JSON.stringify(parsed.data),
      });
      setEmail("");
      await load();
      setNotice("Medlemskapet har sparats.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/teams/${id}/members/${removing.userId}`, {
        method: "DELETE",
      });
      setRemoving(null);
      await load();
      setNotice("Medlemskapet har tagits bort.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (loading && !team) return <p role="status">Hämtar team…</p>;
  if (!team || team.id !== id)
    return (
      <Banner
        status="error"
        title="Teamet kunde inte öppnas"
        description={error}
        endContent={<Button label="Försök igen" onClick={() => void load()} />}
      />
    );
  return (
    <div className="page-stack">
      <Link href="/" isStandalone>
        Alla mina team
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">TEAM</p>
          <h1>{team.name}</h1>
          <p className="muted">{team.description}</p>
          <p>{teamRoleLabels[team.role]}</p>
        </div>
      </header>
      {error && (
        <Banner
          status="error"
          title="Ändringen kunde inte genomföras"
          description={error}
        />
      )}
      {notice && <Banner status="success" title={notice} />}
      <h2>Projekt</h2>
      {projects.length === 0 ? (
        <EmptyState
          title="Teamet har inga projekt ännu"
          description="En teamägare eller redaktör kan skapa det första projektet."
        />
      ) : (
        <div className="document-grid">
          {projects.map((project) => (
            <ClickableCard
              key={project.id}
              label={project.name}
              href={`/projects/${project.id}`}
              padding={6}
            >
              <h3>{project.name}</h3>
              <p className="muted">
                {project.description || "Planeringar med filer och skisser."}
              </p>
            </ClickableCard>
          ))}
        </div>
      )}
      {canWriteTeam(team.role) && (
        <section className="narrow-content page-stack">
          <h2>Skapa projekt</h2>
          <form className="form-stack" onSubmit={create}>
            <TextInput
              label="Projektnamn"
              value={name}
              onChange={setName}
              isRequired
              width="100%"
              isDisabled={busy}
            />
            <TextArea
              label="Projektbeskrivning"
              value={description}
              onChange={setDescription}
              width="100%"
              rows={3}
              isDisabled={busy}
            />
            <Button
              label="Skapa projekt"
              type="submit"
              variant="primary"
              isLoading={busy}
            />
          </form>
        </section>
      )}
      {team.role === "owner" && (
        <>
          <section className="narrow-content page-stack">
            <h2>Teaminställningar</h2>
            <form className="form-stack" onSubmit={rename}>
              <TextInput
                label="Teamnamn"
                value={teamName}
                onChange={setTeamName}
                isRequired
                width="100%"
                isDisabled={busy}
              />
              <TextArea
                label="Teambeskrivning"
                value={teamDescription}
                onChange={setTeamDescription}
                width="100%"
                rows={3}
                isDisabled={busy}
              />
              <Button label="Spara team" type="submit" isLoading={busy} />
            </form>
          </section>
          <section className="page-stack">
            <h2>Medlemmar</h2>
            <p className="muted">
              Rollerna gäller alla projekt i teamet. Globaladmin har åtkomst
              även utan medlemskap.
            </p>
            <ul className="settings-list">
              {members.map((member) => (
                <li key={member.userId}>
                  <div>
                    <strong>{member.name}</strong>
                    <p className="muted">
                      {member.email} · {teamRoleLabels[member.role]}
                    </p>
                  </div>
                  <Button
                    label={`Ta bort ${member.name}`}
                    variant="ghost"
                    isDisabled={busy}
                    onClick={() => setRemoving(member)}
                  />
                </li>
              ))}
            </ul>
            <form className="narrow-content form-stack" onSubmit={saveMember}>
              <TextInput
                label="E-post för befintligt konto"
                type="email"
                value={email}
                onChange={setEmail}
                isRequired
                width="100%"
                isDisabled={busy}
              />
              <Selector
                label="Teamroll"
                value={role}
                onChange={setRole}
                options={Object.entries(teamRoleLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
                width="100%"
                isDisabled={busy}
              />
              <p className="fine-print">
                Spara ett nytt medlemskap eller ändra rollen för den angivna
                personen. Nya konton skapas av globaladmin i Inställningar.
              </p>
              <Button label="Spara medlemskap" type="submit" isLoading={busy} />
            </form>
          </section>
        </>
      )}
      <Dialog
        isOpen={removing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
        purpose="form"
        width={500}
      >
        <DialogHeader title="Ta bort medlemskap?" />
        <div className="dialog-content">
          <p>
            {removing?.name} förlorar åtkomsten till teamets projekt och
            planeringar. En globaladmin behåller sin globala åtkomst.
          </p>
          {error && (
            <Banner
              status="error"
              title="Medlemskapet kunde inte tas bort"
              description={error}
            />
          )}
          <div className="button-row">
            <Button
              label="Avbryt"
              isDisabled={busy}
              onClick={() => setRemoving(null)}
            />
            <Button
              label="Ta bort medlemskap"
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
