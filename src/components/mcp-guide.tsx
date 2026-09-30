"use client";

import { useEffect, useState } from "react";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { mcpConfiguration } from "@/client/mcp-configuration";

export function McpGuide() {
  const [configuration, setConfiguration] = useState<ReturnType<
    typeof mcpConfiguration
  > | null>(null);
  const [client, setClient] = useState("codex");
  useEffect(() => {
    setConfiguration(mcpConfiguration(window.location.origin));
  }, []);
  return (
    <section className="page-stack" aria-labelledby="mcp-guide-heading">
      <header>
        <h2 id="mcp-guide-heading">2. Anslut din AI-klient</h2>
        <p className="muted">
          MCP-servern ingår i Planroom och körs redan i appens Docker-container.
          Codex och Claude Code använder HTTP-adressen nedan. Claude Desktop
          ansluter genom den medföljande lokala bryggan.
        </p>
      </header>
      {configuration ? (
        <CodeBlock
          title="Planrooms MCP-adress"
          code={configuration.endpoint}
          hasCopyButton
          hasLineNumbers={false}
          width="100%"
        />
      ) : (
        <p role="status">Läser adressen till din Planroom-installation…</p>
      )}
      <p className="fine-print">
        Adressen måste vara nåbar från datorn där AI-klienten körs. localhost
        fungerar på samma dator som Planroom. För andra datorer använder ni
        serverns adress eller domän, samma externa port och HTTPS vid
        nätverksdrift.
      </p>
      <TabList
        value={client}
        onChange={setClient}
        role="tablist"
        aria-label="Välj AI-klient för anslutningsguiden"
        hasDivider
        size="lg"
      >
        <Tab
          id="mcp-codex-tab"
          value="codex"
          label="Codex"
          panelId="mcp-codex-panel"
        />
        <Tab
          id="mcp-claude-code-tab"
          value="claude-code"
          label="Claude Code"
          panelId="mcp-claude-code-panel"
        />
        <Tab
          id="mcp-claude-desktop-tab"
          value="claude-desktop"
          label="Claude Desktop"
          panelId="mcp-claude-desktop-panel"
        />
      </TabList>
      <section
        role="tabpanel"
        id="mcp-codex-panel"
        aria-labelledby="mcp-codex-tab"
        hidden={client !== "codex"}
        className="page-stack"
        tabIndex={0}
      >
        <div>
          <h3>Codex CLI</h3>
          <p>
            Lägg till följande avsnitt i <code>~/.codex/config.toml</code>.
            Behåll filens övriga inställningar. Finns redan{" "}
            <code>mcp_servers.planroom</code>, uppdatera det avsnittet.
          </p>
        </div>
        {configuration && (
          <CodeBlock
            title="~/.codex/config.toml · CLI"
            language="toml"
            code={configuration.codexCli}
            hasCopyButton
            width="100%"
          />
        )}
        <div>
          <h3>3. Ange nyckeln och starta klienten</h3>
          <p>
            Ersätt platshållaren med nyckeln du skapade ovan och starta Codex
            från samma terminal. Miljövariabeln behöver sättas i varje ny
            terminalsession.
          </p>
        </div>
        {configuration && (
          <CodeBlock
            title="Terminal · Codex CLI"
            language="bash"
            code={configuration.codexLaunch}
            hasCopyButton
            hasLineNumbers={false}
            width="100%"
          />
        )}
        <div>
          <h3>Codex Desktop</h3>
          <p>
            Desktopappen ärver inte automatiskt miljövariabler som exporteras i
            en terminal. För en lokal Desktop-anslutning kan du i stället
            använda följande avsnitt i din privata{" "}
            <code>~/.codex/config.toml</code>. Det ersätter CLI-avsnittet ovan.
          </p>
        </div>
        {configuration && (
          <CodeBlock
            title="~/.codex/config.toml · alternativ för Desktop"
            language="toml"
            code={configuration.codexDesktop}
            hasCopyButton
            width="100%"
          />
        )}
        <p className="fine-print">
          Byt platshållaren mot din nyckel och håll filen privat; det här
          alternativet lagrar nyckeln direkt i konfigurationen. Dela eller
          checka inte in filen. Öppna en ny chatt efter ändringen och starta om
          Codex Desktop om anslutningen inte visas.
        </p>
        <div>
          <h3>4. Kontrollera anslutningen</h3>
          <p>
            I Codex CLI kan du köra <code>/mcp</code> för att se anslutna
            servrar. Öppna en ny chatt i Desktop och be AI:n lista planeringarna
            via Planroom.
          </p>
        </div>
        <Link
          href="https://developers.openai.com/codex/mcp"
          isExternalLink
          newTabLabel="(öppnas i ny flik)"
          isStandalone
        >
          Officiell dokumentation: Codex och MCP
        </Link>
      </section>
      <section
        role="tabpanel"
        id="mcp-claude-code-panel"
        aria-labelledby="mcp-claude-code-tab"
        hidden={client !== "claude-code"}
        className="page-stack"
        tabIndex={0}
      >
        <div>
          <h3>Claude Code</h3>
          <p>
            Lägg till anslutningen i <code>.mcp.json</code> i projektets rot.
            Finns filen redan, slå ihop <code>planroom</code> med de befintliga
            posterna under <code>mcpServers</code>.
          </p>
        </div>
        {configuration && (
          <CodeBlock
            title=".mcp.json · Claude Code"
            language="json"
            code={configuration.claudeCode}
            hasCopyButton
            width="100%"
          />
        )}
        <div>
          <h3>3. Ange nyckeln och starta klienten</h3>
          <p>
            Ersätt platshållaren nedan med din nyckel och kör kommandona i
            projektets katalog. JSON-filen behåller miljövariabeln, så själva
            nyckeln behöver inte delas med projektet.
          </p>
        </div>
        {configuration && (
          <CodeBlock
            title="Terminal · Claude Code"
            language="bash"
            code={configuration.claudeLaunch}
            hasCopyButton
            hasLineNumbers={false}
            width="100%"
          />
        )}
        <div>
          <h3>4. Kontrollera anslutningen</h3>
          <p>
            Godkänn projektets MCP-anslutning när Claude Code frågar. Kör sedan{" "}
            <code>/mcp</code> i klienten och kontrollera att{" "}
            <code>planroom</code> är ansluten.
          </p>
        </div>
        <Link
          href="https://code.claude.com/docs/en/mcp"
          isExternalLink
          newTabLabel="(öppnas i ny flik)"
          isStandalone
        >
          Officiell dokumentation: Claude Code och MCP
        </Link>
      </section>
      <section
        role="tabpanel"
        id="mcp-claude-desktop-panel"
        aria-labelledby="mcp-claude-desktop-tab"
        hidden={client !== "claude-desktop"}
        className="page-stack"
        tabIndex={0}
      >
        <div>
          <h3>Claude Desktop på samma dator som Planroom</h3>
          <p>
            Ha Docker och Planroom igång. Desktop startar tjänsten{" "}
            <code>mcp-bridge</code> när klienten ansluter. Den översätter den
            lokala MCP-anslutningen till Planrooms API och öppnar ingen extra
            nätverksport.
          </p>
        </div>
        <div>
          <h3>3. Lägg till den lokala anslutningen</h3>
          <p>
            Öppna{" "}
            <code>
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>{" "}
            på din Mac. Lägg till posten nedan under <code>mcpServers</code> och
            behåll eventuella andra anslutningar.
          </p>
        </div>
        {configuration && (
          <CodeBlock
            title="claude_desktop_config.json · macOS"
            language="json"
            code={configuration.claudeDesktop}
            hasCopyButton
            width="100%"
          />
        )}
        <ul>
          <li>
            Byt <code>&lt;ABSOLUT_SÖKVÄG_TILL_PLANROOM&gt;</code> mot hela
            sökvägen till repot som innehåller <code>compose.yaml</code>. Använd
            en absolut sökväg, inte <code>~</code>.
          </li>
          <li>
            Byt <code>&lt;DIN_PLANROOM_NYCKEL&gt;</code> mot din personliga
            åtkomstnyckel. Håll den här konfigurationsfilen privat.
          </li>
          <li>
            Om Desktop inte hittar <code>docker</code>, kör{" "}
            <code>command -v docker</code> i terminalen och använd resultatet
            som <code>command</code>. På macOS kan sökvägen vara{" "}
            <code>/usr/local/bin/docker</code>; använd värdet från din egen
            installation.
          </li>
        </ul>
        <div>
          <h3>4. Starta om och kontrollera anslutningen</h3>
          <p>
            Avsluta Claude Desktop helt och öppna det igen. Kontrollera att{" "}
            <code>planroom</code> visas bland klientens anslutna verktyg och be
            Claude läsa dina planeringar.
          </p>
        </div>
        <Link
          href="https://modelcontextprotocol.io/docs/develop/connect-local-servers"
          isExternalLink
          newTabLabel="(öppnas i ny flik)"
          isStandalone
        >
          Officiell MCP-guide: lokala servrar i Claude Desktop
        </Link>
      </section>
      <div className="page-stack">
        <div>
          <h3>5. Fortsätt arbetet med rätt sammanhang</h3>
          <p>
            Prova att be AI:n läsa planen och dess instruktioner innan den gör
            en uppdatering:
          </p>
        </div>
        <CodeBlock
          title="Exempel på första meddelande"
          code="Lista mina planeringar i Planroom. Läs sedan den planering jag väljer, inklusive AI-instruktionerna, och sammanfatta beslut och nästa steg."
          hasCopyButton
          hasLineNumbers={false}
          isWrapped
          width="100%"
        />
      </div>
      <Banner
        status="info"
        title="Om anslutningen inte fungerar"
        description="Kontrollera serveradressen, att Planroom körs och att nyckeln fortfarande gäller. Med läsbehörighet kan AI:n läsa men inte spara ändringar. Skapa en separat skrivnyckel om klienten ska uppdatera planeringar. Återkalla gamla nycklar i listan ovan när du byter klient."
      />
    </section>
  );
}
