"use client";

import { useRouter } from "next/navigation";
import { Card } from "@astryxdesign/core/Card";
import { Layers3 } from "lucide-react";
import { AccountForm } from "@/components/account-form";

export default function SetupPage() {
  const router = useRouter();
  return (
    <main className="setup-layout">
      <div className="brand">
        <Layers3 aria-hidden />
        <span>Planroom</span>
      </div>
      <Card padding={8} className="setup-card">
        <p className="eyebrow">EN BRA START</p>
        <h1>Gör kontot till ditt</h1>
        <p className="muted">
          Byt startuppgifterna mot ditt namn, din e-postadress och ett nytt
          lösenord innan du öppnar arbetsytan.
        </p>
        <AccountForm onSaved={() => router.replace("/")} />
      </Card>
    </main>
  );
}
