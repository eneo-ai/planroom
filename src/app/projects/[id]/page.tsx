"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  canWriteTeam,
  updateNamedEntitySchema,
  type Project,
} from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { ProjectSharingSettings } from "@/components/project-sharing";
import { DocumentList } from "@/components/document-list";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setProject(null);
    setError("");
    void api<Project>(`/api/projects/${id}`, { signal: controller.signal })
      .then((current) => {
        if (controller.signal.aborted) return;
        setProject(current);
        setName(current.name);
        setDescription(current.description);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    const parsed = updateNamedEntitySchema.safeParse({
      name,
      description,
      expectedVersion: project.version,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setProject(
        await api<Project>(`/api/projects/${id}`, {
          method: "PUT",
          body: JSON.stringify(parsed.data),
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Hämtar projekt…</p>;
  if (!project || project.id !== id)
    return (
      <Banner
        status="error"
        title="Projektet kunde inte öppnas"
        description={error}
      />
    );
  return (
    <div className="page-stack">
      <Link href={`/teams/${project.teamId}`} isStandalone>
        {project.teamName}
      </Link>
      {error && (
        <Banner
          status="error"
          title="Projektet kunde inte sparas"
          description={error}
        />
      )}
      <DocumentList key={project.id} project={project} />
      {project.role === "owner" && (
        <ProjectSharingSettings key={project.id} projectId={project.id} />
      )}
      {canWriteTeam(project.role) && (
        <section className="narrow-content page-stack">
          <h2>Projektinställningar</h2>
          <form className="form-stack" onSubmit={rename}>
            <TextInput
              label="Projektnamn"
              value={name}
              onChange={setName}
              width="100%"
              isRequired
              isDisabled={busy}
            />
            <TextArea
              label="Beskrivning"
              value={description}
              onChange={setDescription}
              width="100%"
              rows={3}
              isDisabled={busy}
            />
            <Button label="Spara projekt" type="submit" isLoading={busy} />
          </form>
        </section>
      )}
    </div>
  );
}
