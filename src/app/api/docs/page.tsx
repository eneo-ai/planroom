import type { Metadata } from "next";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { Link } from "@astryxdesign/core/Link";
import { Banner } from "@astryxdesign/core/Banner";
import { Layers3 } from "lucide-react";
import { ApiReferenceViewer } from "@/components/api-reference-viewer";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "REST API-referens",
  description:
    "Utforska Planrooms REST API, autentisering, datascheman och svar. Prova anrop med din personliga API-nyckel.",
};

export default function ApiDocumentationPage() {
  return (
    <div className={styles.page}>
      <TopNav
        label="Planrooms API-dokumentation"
        heading={
          <TopNavHeading
            heading="Planroom"
            headingHref="/"
            logo={<Layers3 size={24} aria-hidden />}
            subheading="API-dokumentation"
          />
        }
        endContent={
          <Link href="/" isStandalone>
            Öppna arbetsytan
          </Link>
        }
      />
      <main>
        <header className={styles.intro}>
          <p className="eyebrow">REST · OPENAPI 3.1</p>
          <h1>Bygg vidare på era planeringar</h1>
          <p className="muted">
            Utforska adresser, parametrar, datascheman och exempel. Med Test
            Request kan du göra riktiga anrop till den här installationen.
          </p>
          <div className="button-row">
            <Link href="/api/openapi.json" isStandalone>
              Öppna OpenAPI-definitionen
            </Link>
            <Link href="/settings" isStandalone>
              Skapa en API-nyckel
            </Link>
          </div>
          <Banner
            status="info"
            title="Prova med en personlig API-nyckel"
            description="Skapa en nyckel i Inställningar och ange den i referensens autentisering. read ger läsåtkomst; write ger även skrivrättigheter inom din kontoroll. Nyckeln sparas inte mellan sidladdningar. Testanrop använder inga inloggningscookies. Kontoändringar, skapande och återkallning av nycklar samt teamadministration görs därför i arbetsytans vanliga gränssnitt."
          />
          <p className="fine-print">
            Testanrop kan ändra riktiga planeringar när din nyckel har
            skrivrättigheter. REST använder vanliga HTTP-anrop. AI-klienter
            ansluter i stället till MCP på <code>/api/mcp</code>;
            anslutningsguiden finns i{" "}
            <Link href="/settings">Inställningar</Link>.
          </p>
        </header>
        <section
          className={styles.reference}
          aria-label="Interaktiv REST API-referens"
        >
          <ApiReferenceViewer />
        </section>
      </main>
    </div>
  );
}
