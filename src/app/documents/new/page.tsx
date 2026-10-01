"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { ArrowLeft, Plus } from "lucide-react";
import { documentContentSchema, type DocumentDetail } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { DocumentFields, emptyDocument } from "@/components/document-fields";
import { PlanningFileImport } from "@/components/document-files";
import { PlanningFileViewer } from "@/components/planning-file-viewer";
import { useSession } from "@/components/session";
import {
  useDocumentDraft,
  useDraftProtection,
} from "@/components/document-drafts";

export default function NewDocumentPage() {
  const [draft, setDraft] = useDocumentDraft("new");
  const value = draft?.content ?? emptyDocument;
  function setValue(content: typeof emptyDocument) {
    setDraft({ content, expectedVersion: null, modified: true });
  }
  const [tab, setTab] = useState("edit");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const router = useRouter();
  const { user } = useSession();
  const dirty =
    value.title !== emptyDocument.title ||
    value.description !== emptyDocument.description ||
    JSON.stringify(value.files) !== JSON.stringify(emptyDocument.files) ||
    value.instructions !== emptyDocument.instructions ||
    value.status !== emptyDocument.status ||
    value.changeSummary !== emptyDocument.changeSummary;
  useDraftProtection(dirty, busy || importing);
  if (user?.role === "viewer")
    return (
      <Banner
        status="info"
        title="Du har läsbehörighet"
        description="Be en administratör om redaktörsbehörighet för att skapa planeringar."
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || importing) return;
    setError("");
    const parsed = documentContentSchema.safeParse(value);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" · "),
      );
      return;
    }
    setBusy(true);
    try {
      const document = await api<DocumentDetail>("/api/documents", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      setDraft(undefined);
      router.push(`/documents/${document.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-stack">
      <Link href="/" isStandalone>
        <ArrowLeft size={14} aria-hidden /> Alla planeringar
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">EN GEMENSAM START</p>
          <h1>Ny planering</h1>
          <p className="muted">
            Importera era HTML- och Markdown-filer och ge nästa person rätt
            sammanhang.
          </p>
        </div>
      </header>
      <form onSubmit={submit} className="page-stack">
        {error && (
          <Banner
            status="error"
            title="Planeringen kunde inte skapas"
            description={error}
          />
        )}
        <PlanningFileImport
          files={value.files}
          isDisabled={busy}
          onReadingChange={setImporting}
          onImport={(files) =>
            setDraft((current) => ({
              content: {
                ...(current?.content ?? emptyDocument),
                files: [...(current?.content.files ?? []), ...files],
                title:
                  current?.content.title ||
                  files[0]?.name.replace(/\.[^.]+$/, "") ||
                  "Ny planering",
              },
              expectedVersion: null,
              modified: true,
            }))
          }
        />
        <TabList
          value={tab}
          onChange={setTab}
          role="tablist"
          aria-label="Ny planering"
          hasDivider
          size="lg"
        >
          <Tab
            id="new-edit-tab"
            value="edit"
            label="Innehåll och instruktioner"
            panelId="new-edit-panel"
          />
          <Tab
            id="new-preview-tab"
            value="preview"
            label="Förhandsvisning"
            panelId="new-preview-panel"
          />
        </TabList>
        <div
          hidden={tab !== "edit"}
          role="tabpanel"
          id="new-edit-panel"
          aria-labelledby="new-edit-tab"
        >
          <DocumentFields
            value={value}
            onChange={setValue}
            isDisabled={busy || importing}
          />
        </div>
        <div
          hidden={tab !== "preview"}
          role="tabpanel"
          id="new-preview-panel"
          aria-labelledby="new-preview-tab"
        >
          <PlanningFileViewer
            files={value.files}
            title={value.title || "Ny planering"}
          />
        </div>
        <div className="form-actions">
          <Button label="Tillbaka till planeringar" href="/" variant="ghost" />
          <Button
            label="Skapa planering"
            type="submit"
            variant="primary"
            isLoading={busy}
            isDisabled={importing}
            icon={<Plus size={18} aria-hidden />}
          />
        </div>
      </form>
    </div>
  );
}
