"use client";
import { useEffect, useState } from "react";
import { Selector } from "@astryxdesign/core/Selector";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { canWriteTeam, type Project } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { NewDocument } from "@/components/new-document";
import { useDocumentDrafts } from "@/components/document-drafts";
export default function NewDocumentPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { requestLeave } = useDocumentDrafts();
  useEffect(() => {
    const controller = new AbortController();
    void api<{ projects: Project[] }>("/api/projects", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setProjects(
            result.projects.filter((project) => canWriteTeam(project.role)),
          );
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const project = projects.find((entry) => entry.id === projectId);
  if (loading) return <p role="status">Hämtar projekt…</p>;
  if (error)
    return (
      <Banner
        status="error"
        title="Projekt kunde inte hämtas"
        description={error}
      />
    );
  if (!projects.length)
    return (
      <EmptyState
        title="Du har inget projekt att skapa planeringar i"
        description="Be en teamägare om redaktörsbehörighet och skapa ett projekt i teamet."
      />
    );
  return (
    <div className="page-stack">
      <Selector
        label="Projekt för den nya planeringen"
        value={projectId}
        onChange={(next) => requestLeave(() => setProjectId(next))}
        options={projects.map((entry) => ({
          value: entry.id,
          label: `${entry.teamName} / ${entry.name}`,
        }))}
        placeholder="Välj team och projekt"
        width="100%"
        isRequired
        hasSearch
      />
      {project ? (
        <NewDocument key={project.id} project={project} />
      ) : (
        <p>Välj projektet som planeringen ska tillhöra.</p>
      )}
    </div>
  );
}
