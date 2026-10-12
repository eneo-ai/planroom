"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import type { Project } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { NewDocument } from "@/components/new-document";
export default function NewProjectTaskPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setProject(null);
    setError("");
    void api<Project>(`/api/projects/${id}`, { signal: controller.signal })
      .then((current) => {
        if (!controller.signal.aborted) setProject(current);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [id]);
  if (error)
    return (
      <Banner
        status="error"
        title="Projektet kunde inte öppnas"
        description={error}
      />
    );
  return project && project.id === id ? (
    <NewDocument key={project.id} project={project} />
  ) : (
    <p role="status">Hämtar projekt…</p>
  );
}
