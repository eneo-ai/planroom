"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Button } from "@astryxdesign/core/Button";
import {
  Layers3,
  FileText,
  Settings2,
  Plus,
  LogOut,
  ShieldCheck,
  Braces,
} from "lucide-react";
import { useSession } from "./session";
import { api, errorMessage } from "@/client/api";
import { roles } from "@/client/document-format";
import { Banner } from "@astryxdesign/core/Banner";
import { useState } from "react";
import { useDocumentDrafts } from "./document-drafts";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, setUser } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");
  const { requestLeave, clearDrafts } = useDocumentDrafts();
  if (
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname === "/api/docs"
  )
    return children;
  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
      clearDrafts();
      setUser(null);
      router.replace("/login");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <AppShell
      height="auto"
      variant="section"
      contentPadding={0}
      topNav={
        <TopNav
          label="Planroom"
          heading={
            <TopNavHeading
              heading="Planroom"
              headingHref="/"
              logo={<Layers3 size={24} aria-hidden />}
              subheading="Gemensam planering"
            />
          }
          endContent={
            <div className="account-nav">
              <span className="muted">{user?.name}</span>
              <Button
                label="Logga ut"
                variant="ghost"
                icon={<LogOut size={16} aria-hidden />}
                onClick={() => requestLeave(() => void logout(), true)}
              />
            </div>
          }
        />
      }
      sideNav={
        <SideNav
          aria-label="Arbetsytans navigation"
          className="workspace-nav"
          footer={
            <div className="nav-footer">
              <ShieldCheck size={18} aria-hidden />
              <span>
                {user ? roles[user.role] : ""}
                <br />
                <span className="muted">Privat arbetsyta</span>
              </span>
            </div>
          }
        >
          <SideNavSection title="Arbetsyta">
            <SideNavItem
              label="Planeringar"
              icon={<FileText size={18} aria-hidden />}
              href="/"
              isSelected={
                pathname === "/" ||
                (pathname.startsWith("/documents/") &&
                  pathname !== "/documents/new")
              }
            />
            {user?.role !== "viewer" && (
              <SideNavItem
                label="Ny planering"
                icon={<Plus size={18} aria-hidden />}
                href="/documents/new"
                isSelected={pathname === "/documents/new"}
              />
            )}
            <SideNavItem
              label="Inställningar"
              icon={<Settings2 size={18} aria-hidden />}
              href="/settings"
              isSelected={pathname === "/settings"}
            />
            <SideNavItem
              label="API-dokumentation"
              icon={<Braces size={18} aria-hidden />}
              href="/api/docs"
              isSelected={pathname === "/api/docs"}
            />
          </SideNavSection>
          <div className="nav-note">
            <p>En plan. En länk.</p>
            <p className="muted">
              Samla presentation, beslut och AI-instruktioner på samma plats.
            </p>
          </div>
        </SideNav>
      }
    >
      <div className="page-container">
        {error && (
          <Banner
            status="error"
            title="Kunde inte logga ut"
            description={error}
          />
        )}
        {children}
      </div>
    </AppShell>
  );
}
