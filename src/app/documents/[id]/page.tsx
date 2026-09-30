"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import {
  ArrowLeft,
  Link2,
  Download,
  Save,
  Eye,
  Code2,
  Bot,
  MessageSquare,
  History,
  LockKeyhole,
  Github,
} from "lucide-react";
import {
  documentContentSchema,
  canEditDocumentContent,
  type DocumentContent,
  type DocumentDetail,
} from "@/contracts";
import { api, ApiError, errorMessage } from "@/client/api";
import { formatDate } from "@/client/document-format";
import {
  DocumentStatusBadge,
  DocumentStatusControl,
} from "@/components/document-status";
import {
  DocumentGitHubLinks,
  GitHubReferences,
} from "@/components/document-github-links";
import { DocumentFields, HtmlImport } from "@/components/document-fields";
import { HtmlViewer } from "@/components/html-viewer";
import { DocumentComments } from "@/components/document-comments";
import { DocumentHistory } from "@/components/document-history";
import { useSession } from "@/components/session";
import {
  useDocumentDraft,
  useDraftProtection,
} from "@/components/document-drafts";

function editable(document: DocumentDetail): DocumentContent {
  return {
    title: document.title,
    description: document.description,
    html: document.html,
    instructions: document.instructions,
    status: document.status,
    changeSummary: "",
  };
}

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const canWrite = user?.role === "admin" || user?.role === "editor";
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const canEdit =
    canWrite && document !== null && canEditDocumentContent(document.status);
  const [draft, setDraft] = useDocumentDraft(id);
  const buffer = draft?.content ?? null;
  const [tab, setTab] = useState("preview");
  const [loadedTabs, setLoadedTabs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [serverConflict, setConflict] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [discard, setDiscard] = useState(false);
  const dirty =
    document && buffer
      ? buffer.title !== document.title ||
        buffer.description !== document.description ||
        buffer.html !== document.html ||
        buffer.instructions !== document.instructions ||
        buffer.status !== document.status ||
        buffer.changeSummary !== ""
      : false;
  const conflict =
    serverConflict ??
    (document &&
    draft?.modified &&
    draft.expectedRevision !== document.currentRevision
      ? document.currentRevision
      : null);
  useDraftProtection(dirty, busy || importing);
  function setBuffer(content: DocumentContent) {
    setDraft((current) =>
      current ? { ...current, content, modified: true } : undefined,
    );
  }
  const accept = useCallback(
    (next: DocumentDetail, preserveDraft = false) => {
      setDocument(next);
      setDraft((current) =>
        preserveDraft && current?.modified
          ? current
          : {
              content: editable(next),
              expectedRevision: next.currentRevision,
              modified: false,
            },
      );
      setConflict(null);
      setError("");
    },
    [setDraft],
  );
  const load = useCallback(
    async (signal?: AbortSignal, preserveDraft = false) => {
      setError("");
      setLoading(true);
      try {
        const next = await api<DocumentDetail>(`/api/documents/${id}`, {
          signal,
        });
        if (!signal?.aborted) accept(next, preserveDraft);
      } catch (cause) {
        if (!signal?.aborted) setError(errorMessage(cause));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id, accept],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal, true);
    return () => controller.abort();
  }, [load]);
  useEffect(
    () => () =>
      setDraft((current) => (current?.modified ? current : undefined)),
    [setDraft],
  );
  function reload() {
    if (dirty) setDiscard(true);
    else void load();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      !canEdit ||
      !document ||
      !buffer ||
      document.id !== id ||
      busy ||
      importing
    )
      return;
    setError("");
    setNotice("");
    const parsed = documentContentSchema.safeParse(buffer);
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
      const next = await api<DocumentDetail>(`/api/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...parsed.data,
          expectedRevision: draft?.expectedRevision ?? document.currentRevision,
        }),
      });
      accept(next);
      setNotice(`Version ${next.currentRevision} har sparats.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "REVISION_CONFLICT")
        setConflict(cause.currentRevision ?? document.currentRevision + 1);
      else {
        if (cause instanceof ApiError && cause.code === "DOCUMENT_LOCKED")
          await load(undefined, true);
        setError(errorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0]);
      setNotice(
        "Länken är kopierad. Mottagaren behöver ett konto i arbetsytan.",
      );
    } catch {
      setError(
        "Länken kunde inte kopieras. Kopiera adressen från webbläsarens adressfält.",
      );
    }
  }
  function changeTab(value: string) {
    setTab(value);
    setLoadedTabs((current) =>
      current.includes(value) ? current : [...current, value],
    );
  }
  function metadataError(cause: unknown) {
    if (cause instanceof ApiError && cause.code === "REVISION_CONFLICT")
      setConflict(
        cause.currentRevision ?? (document?.currentRevision ?? 0) + 1,
      );
    setError(errorMessage(cause));
  }
  function metadataUpdated(next: DocumentDetail) {
    accept(next);
    if (tab === "edit" && !canEditDocumentContent(next.status))
      setTab("preview");
    setNotice(`Version ${next.currentRevision} har sparats.`);
  }
  if (loading && (!document || document.id !== id))
    return (
      <div role="status" className="loading-state">
        Hämtar planeringen…
      </div>
    );
  if (!document || !buffer || document.id !== id)
    return (
      <Banner
        status="error"
        title="Planeringen kunde inte öppnas"
        description={error}
        endContent={<Button label="Försök igen" onClick={() => void load()} />}
      />
    );
  const showEditor = canWrite && (canEdit || dirty);
  const activeTab = tab === "edit" && !showEditor ? "preview" : tab;
  const tabs = [
    { value: "preview", label: "Planering", icon: Eye },
    ...(showEditor
      ? [
          {
            value: "edit",
            label: canEdit ? "Redigera" : "Osparat utkast",
            icon: Code2,
          },
        ]
      : []),
    { value: "instructions", label: "AI-instruktioner", icon: Bot },
    { value: "github", label: "GitHub", icon: Github },
    { value: "comments", label: "Diskussion", icon: MessageSquare },
    { value: "history", label: "Historik", icon: History },
  ];
  return (
    <div className="page-stack">
      <Link href="/" isStandalone>
        <ArrowLeft size={14} aria-hidden /> Alla planeringar
      </Link>
      <header className="page-heading">
        <div>
          <div className="button-row">
            <p className="eyebrow">GEMENSAM PLANERING</p>
            {canWrite ? (
              <DocumentStatusControl
                document={document}
                isDisabled={dirty || busy || importing || conflict !== null}
                disabledMessage={
                  dirty
                    ? "Spara eller förkasta osparade ändringar innan du byter status."
                    : conflict !== null
                      ? "Ladda om den aktuella versionen innan du byter status."
                      : undefined
                }
                onUpdated={metadataUpdated}
                onError={metadataError}
                onSavingChange={setBusy}
              />
            ) : (
              <DocumentStatusBadge status={document.status} />
            )}
          </div>
          <h1>{document.title}</h1>
          <p className="muted">{document.description}</p>
          <p className="revision-caption">
            Version {document.currentRevision} · Uppdaterad{" "}
            {formatDate(document.updatedAt)} av {document.authorName}
          </p>
          <GitHubReferences links={document.githubLinks} />
        </div>
        <div className="button-row">
          {canWrite && (
            <Button
              label="Koppla GitHub"
              icon={<Github size={16} aria-hidden />}
              onClick={() => changeTab("github")}
            />
          )}
          <Button
            label="Kopiera länk"
            icon={<Link2 size={16} aria-hidden />}
            onClick={() => void copyLink()}
          />
          <Link href={`/api/documents/${id}/export`} download isStandalone>
            <Download size={16} aria-hidden /> Exportera HTML
          </Link>
        </div>
      </header>
      {!canEditDocumentContent(document.status) && (
        <Banner
          status="info"
          title="Planen är låst för innehållsändringar"
          icon={<LockKeyhole size={18} aria-hidden />}
          description="HTML, titel, beskrivning och AI-instruktioner är låsta. Byt status till Utkast eller Aktiv planering för att lägga till mer. Diskussion och GitHub-kopplingar är fortfarande tillgängliga."
        />
      )}
      {error && (
        <Banner
          status="error"
          title="Åtgärden kunde inte slutföras"
          description={error}
        />
      )}
      {notice && (
        <Banner
          key={notice}
          status="success"
          title={notice}
          isDismissable
          dismissLabel="Stäng meddelande"
          onDismiss={() => setNotice("")}
        />
      )}
      {conflict !== null && (
        <Banner
          status="warning"
          title={`Planeringen har en nyare version (${conflict})`}
          description="Dina ändringar finns kvar i redigeraren. Kopiera dem innan du laddar om, jämför med den nya versionen och gör sedan uppdateringen igen."
          endContent={
            <Button label="Ladda om aktuell version" onClick={reload} />
          }
        />
      )}
      {dirty && (
        <div className="unsaved-strip" role="status">
          Du har osparade ändringar i redigeraren.{" "}
          <Button
            label="Förkasta och ladda om"
            size="sm"
            variant="ghost"
            onClick={() => setDiscard(true)}
          />
        </div>
      )}
      <TabList
        value={activeTab}
        onChange={changeTab}
        role="tablist"
        aria-label="Planeringens vyer"
        hasDivider
        size="lg"
      >
        {tabs.map(({ value, label, icon: Icon }) => (
          <Tab
            key={value}
            id={`tab-${value}`}
            value={value}
            label={label}
            icon={<Icon size={16} aria-hidden />}
            panelId={`panel-${value}`}
          />
        ))}
      </TabList>
      <section
        hidden={activeTab !== "preview"}
        role="tabpanel"
        id="panel-preview"
        aria-labelledby="tab-preview"
      >
        <HtmlViewer
          key={document.currentRevision}
          html={document.html}
          title={document.title}
        />
      </section>
      {showEditor && (
        <section
          hidden={activeTab !== "edit"}
          role="tabpanel"
          id="panel-edit"
          aria-labelledby="tab-edit"
        >
          <form onSubmit={save} className="page-stack">
            {!canEdit && (
              <Banner
                status="warning"
                title="Ditt lokala utkast finns kvar"
                description="Planen har låsts i en annan session. Kopiera dina ändringar innan du förkastar utkastet. Innehållet kan sparas först efter att planen har öppnats igen."
              />
            )}
            {canEdit && (
              <HtmlImport
                isDisabled={busy}
                onReadingChange={setImporting}
                onImport={(html) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          content: { ...current.content, html },
                          modified: true,
                        }
                      : undefined,
                  )
                }
              />
            )}
            <DocumentFields
              value={buffer}
              onChange={setBuffer}
              isDisabled={busy}
              isReadOnly={!canEdit}
              showStatus={false}
            />
            <div className="form-actions">
              <p className="muted">
                Utgår från version{" "}
                {draft?.expectedRevision ?? document.currentRevision}. En
                sparning skapar en ny version.
              </p>
              <Button
                label="Spara ny version"
                type="submit"
                variant="primary"
                isLoading={busy}
                isDisabled={
                  !canEdit || !dirty || conflict !== null || importing
                }
                icon={<Save size={16} aria-hidden />}
              />
            </div>
            <h2>Förhandsvisning av dina ändringar</h2>
            <HtmlViewer
              html={buffer.html}
              title={buffer.title || "Osparad planering"}
            />
          </form>
        </section>
      )}
      <section
        hidden={activeTab !== "instructions"}
        role="tabpanel"
        id="panel-instructions"
        aria-labelledby="tab-instructions"
        className="narrow-content page-stack"
      >
        <div>
          <h2>Rätt sammanhang för nästa steg</h2>
          <p className="muted">
            AI-klienten läser dessa instruktioner tillsammans med den aktuella
            HTML-versionen via MCP.
          </p>
        </div>
        <div className="instructions-content preserve-lines">
          {document.instructions || "Inga instruktioner har lagts till ännu."}
        </div>
        {canEdit && (
          <div>
            <Button
              label="Redigera instruktioner"
              onClick={() => changeTab("edit")}
            />
          </div>
        )}
        <p className="fine-print">
          Instruktioner är innehåll i planen. De ger aldrig AI-klienten större
          behörighet än ditt konto eller din åtkomstnyckel.
        </p>
      </section>
      <section
        hidden={activeTab !== "github"}
        role="tabpanel"
        id="panel-github"
        aria-labelledby="tab-github"
        className="narrow-content"
      >
        <DocumentGitHubLinks
          document={document}
          canWrite={canWrite}
          isDisabled={dirty || busy || importing || conflict !== null}
          onUpdated={metadataUpdated}
          onError={metadataError}
          onSavingChange={setBusy}
        />
      </section>
      <section
        hidden={activeTab !== "comments"}
        role="tabpanel"
        id="panel-comments"
        aria-labelledby="tab-comments"
      >
        {loadedTabs.includes("comments") && (
          <DocumentComments documentId={id} canComment={canWrite} />
        )}
      </section>
      <section
        hidden={activeTab !== "history"}
        role="tabpanel"
        id="panel-history"
        aria-labelledby="tab-history"
      >
        {loadedTabs.includes("history") && (
          <DocumentHistory
            document={document}
            canRestore={
              canEdit && !dirty && !busy && !importing && conflict === null
            }
            onRestored={(next) => {
              accept(next);
              setNotice(
                `Version ${next.currentRevision} skapades genom återställning.`,
              );
            }}
            onReload={reload}
          />
        )}
      </section>
      <Dialog
        isOpen={discard}
        onOpenChange={setDiscard}
        width={500}
        purpose="form"
      >
        <DialogHeader
          title="Förkasta dina osparade ändringar?"
          onOpenChange={setDiscard}
        />
        <div className="dialog-content">
          <p>
            Redigeraren ersätts med den senaste sparade versionen. Kopiera din
            HTML och dina instruktioner först om du vill behålla dem.
          </p>
          <div className="button-row">
            <Button
              label="Behåll ändringarna"
              onClick={() => setDiscard(false)}
            />
            <Button
              label="Förkasta och ladda om"
              variant="destructive"
              onClick={() => {
                setDiscard(false);
                void load();
              }}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
