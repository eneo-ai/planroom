"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type SetStateAction,
} from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Button } from "@astryxdesign/core/Button";
import type { DocumentContent } from "@/contracts";
import { shouldGuardDraftLink } from "@/client/draft-navigation";

export interface DocumentDraft {
  content: DocumentContent;
  expectedVersion: number | null;
  modified: boolean;
}
interface Protection {
  dirty: boolean;
  saving: boolean;
}
interface PendingLeave {
  action: () => void;
  logout: boolean;
}
interface DraftState {
  drafts: Record<string, DocumentDraft>;
  generation: number;
  updateDraft: (
    key: string,
    update: SetStateAction<DocumentDraft | undefined>,
    generation: number,
  ) => void;
  clearDrafts: () => void;
  protection: Protection;
  protect: (protection: Protection) => void;
  requestLeave: (action: () => void, logout?: boolean) => void;
}
const DraftContext = createContext<DraftState | null>(null);

/** Owns this tab's edit buffers and their original base revisions across routes. */
export function DocumentDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, DocumentDraft>>({});
  const generationRef = useRef(0);
  const [generation, setGeneration] = useState(0);
  const [protection, protect] = useState<Protection>({
    dirty: false,
    saving: false,
  });
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const updateDraft = useCallback(
    (
      key: string,
      update: SetStateAction<DocumentDraft | undefined>,
      ownerGeneration: number,
    ) => {
      setDrafts((current) => {
        // Ignore a delayed import/save response from before logout or account change.
        if (ownerGeneration !== generationRef.current) return current;
        const next =
          typeof update === "function" ? update(current[key]) : update;
        const result = { ...current };
        if (next) result[key] = next;
        else delete result[key];
        return result;
      });
    },
    [],
  );
  const clearDrafts = useCallback(() => {
    generationRef.current += 1;
    setGeneration(generationRef.current);
    setDrafts({});
    setPending(null);
    protect({ dirty: false, saving: false });
  }, []);
  function requestLeave(action: () => void, logout = false) {
    if (protection.dirty || protection.saving) setPending({ action, logout });
    else action();
  }
  useEffect(() => {
    if (!protection.dirty && !protection.saving) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [protection]);
  return (
    <DraftContext.Provider
      value={{
        drafts,
        generation,
        updateDraft,
        clearDrafts,
        protection,
        protect,
        requestLeave,
      }}
    >
      {children}
      <Dialog
        isOpen={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        purpose="form"
        width={520}
      >
        <DialogHeader
          title={
            protection.saving
              ? "Planeringen håller på att sparas"
              : pending?.logout
                ? "Logga ut med osparade ändringar?"
                : "Lämna med osparade ändringar?"
          }
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
        />
        <div className="dialog-content">
          <p>
            {protection.saving
              ? "Vänta tills sparningen är klar innan du lämnar sidan."
              : pending?.logout
                ? "Dina osparade ändringar tas bort när du loggar ut. Stanna och spara först om du vill behålla dem."
                : "Ändringarna är inte sparade som en version. De finns tillfälligt kvar i den här fliken om du återvänder, men försvinner vid omladdning eller utloggning."}
          </p>
          <div className="button-row">
            <Button label="Stanna kvar" onClick={() => setPending(null)} />
            <Button
              label={pending?.logout ? "Logga ut och förkasta" : "Lämna sidan"}
              variant={pending?.logout ? "destructive" : "primary"}
              isDisabled={protection.saving}
              onClick={() => {
                const leave = pending;
                setPending(null);
                protect({ dirty: false, saving: false });
                leave?.action();
              }}
            />
          </div>
        </div>
      </Dialog>
    </DraftContext.Provider>
  );
}

export function useDocumentDrafts() {
  const state = useContext(DraftContext);
  if (!state) throw new Error("DocumentDraftProvider saknas.");
  return state;
}

export function useDocumentDraft(key: string) {
  const { drafts, generation, updateDraft } = useDocumentDrafts();
  const setDraft = useCallback(
    (update: SetStateAction<DocumentDraft | undefined>) =>
      updateDraft(key, update, generation),
    [key, updateDraft, generation],
  );
  return [drafts[key], setDraft] as const;
}

export function useDraftProtection(dirty: boolean, saving: boolean) {
  const { protect } = useDocumentDrafts();
  useEffect(() => {
    protect({ dirty, saving });
  }, [dirty, saving, protect]);
  useEffect(() => () => protect({ dirty: false, saving: false }), [protect]);
}

export function DraftAwareLink({
  href,
  onClick,
  ...props
}: ComponentProps<typeof NextLink>) {
  const { requestLeave, protection } = useDocumentDrafts();
  const router = useRouter();
  return (
    <NextLink
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (
          typeof href !== "string" ||
          (!protection.dirty && !protection.saving)
        )
          return;
        if (
          shouldGuardDraftLink({
            href,
            currentUrl: window.location.href,
            target: props.target,
            download: Boolean(props.download) || props.download === "",
            modified:
              event.button !== 0 ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              event.altKey,
            prevented: event.defaultPrevented,
          })
        ) {
          event.preventDefault();
          requestLeave(() => router.push(href));
        }
      }}
    />
  );
}
