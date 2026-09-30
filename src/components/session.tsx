"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import type { User } from "@/contracts";
import { api, errorMessage } from "@/client/api";
import { useDocumentDrafts } from "./document-drafts";

interface SessionState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
}
const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const { clearDrafts } = useDocumentDrafts();
  useEffect(() => {
    clearDrafts();
  }, [user?.id, clearDrafts]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUser((await api<{ user: User | null }>("/api/auth/session")).user);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (loading || error) return;
    if (!user && pathname !== "/login") router.replace("/login");
    else if (user?.mustChangePassword && pathname !== "/setup")
      router.replace("/setup");
    else if (user && pathname === "/login")
      router.replace(user.mustChangePassword ? "/setup" : "/");
  }, [user, loading, pathname, error, router]);
  if (loading)
    return (
      <div className="center-state" role="status">
        Planroom laddar…
      </div>
    );
  if (error)
    return (
      <div className="center-state">
        <Banner
          status="error"
          title="Kunde inte läsa din session"
          description={error}
          endContent={
            <Button label="Försök igen" onClick={() => void load()} />
          }
        />
      </div>
    );
  const allowed = user
    ? (!user.mustChangePassword || pathname === "/setup") &&
      pathname !== "/login"
    : pathname === "/login";
  if (!allowed)
    return (
      <div className="center-state" role="status">
        Öppnar din arbetsyta…
      </div>
    );
  return (
    <SessionContext.Provider value={{ user, loading, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const state = useContext(SessionContext);
  if (!state) throw new Error("SessionProvider saknas.");
  return state;
}
