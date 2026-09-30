"use client";

import { useState } from "react";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { UserRound, KeyRound, Users } from "lucide-react";
import { useSession } from "@/components/session";
import { AccountForm } from "@/components/account-form";
import { ApiTokens } from "@/components/api-tokens";
import { AdminUsers } from "@/components/admin-users";

export default function SettingsPage() {
  const { user } = useSession();
  const [tab, setTab] = useState("account");
  const [loaded, setLoaded] = useState<string[]>(["account"]);
  function change(value: string) {
    setTab(value);
    setLoaded((current) =>
      current.includes(value) ? current : [...current, value],
    );
  }
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">DIN ARBETSYTA</p>
          <h1>Inställningar</h1>
          <p className="muted">Hantera ditt konto, AI-åtkomst och teamet.</p>
        </div>
      </header>
      <TabList
        value={tab}
        onChange={change}
        role="tablist"
        aria-label="Inställningar"
        hasDivider
        size="lg"
      >
        <Tab
          id="settings-account-tab"
          value="account"
          label="Mitt konto"
          icon={<UserRound size={16} aria-hidden />}
          panelId="settings-account"
        />
        <Tab
          id="settings-tokens-tab"
          value="tokens"
          label="AI och API"
          icon={<KeyRound size={16} aria-hidden />}
          panelId="settings-tokens"
        />
        {user?.role === "admin" && (
          <Tab
            id="settings-users-tab"
            value="users"
            label="Personer"
            icon={<Users size={16} aria-hidden />}
            panelId="settings-users"
          />
        )}
      </TabList>
      <section
        hidden={tab !== "account"}
        role="tabpanel"
        id="settings-account"
        aria-labelledby="settings-account-tab"
        className="narrow-content page-stack"
      >
        <div>
          <h2>Dina uppgifter</h2>
          <p className="muted">
            Ange ditt nuvarande lösenord för att ändra kontot. Tidigare
            sessioner avslutas när ändringen sparas.
          </p>
        </div>
        <AccountForm />
      </section>
      <section
        hidden={tab !== "tokens"}
        role="tabpanel"
        id="settings-tokens"
        aria-labelledby="settings-tokens-tab"
      >
        {loaded.includes("tokens") && <ApiTokens />}
      </section>
      {user?.role === "admin" && (
        <section
          hidden={tab !== "users"}
          role="tabpanel"
          id="settings-users"
          aria-labelledby="settings-users-tab"
        >
          {loaded.includes("users") && <AdminUsers />}
        </section>
      )}
    </div>
  );
}
