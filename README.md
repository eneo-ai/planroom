# Planroom

En gemensam plats för HTML-planeringar. Dela en fast länk, bevara diagram och interaktiva demonstrationer, och låt människor och AI arbeta mot samma versionshistorik.

Planroom är ett eget repo och en fristående tjänst. React/Next.js och TypeScript står för webb och API, PostgreSQL för innehåll och historik, Astryx för komponenter och designtokens. MCP använder den officiella SDK:n och samma dokumentlogik som webbgränssnittet.

## Starta med Docker

Du behöver Docker med Compose. Kör i repots rot:

```sh
node scripts/configure.mjs
```

Det skapar `.env` med unika slumpmässiga lösenord och privata filrättigheter. En befintlig `.env` lämnas orörd. Alternativt kan du kopiera `.env.example` och ange egna lösenord.

På denna Mac finns en startväg som använder den gemensamma resurssupervisorn och en tillfällig Docker-byggare med högst 2 GiB minne och en CPU:

```sh
python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 600 -- node scripts/start-local.mjs
```

Den bygger bilden, startar tjänsterna och väntar på hälsokontroller. Byggaren tas bort efteråt; appen och databasen fortsätter köra. Docker-containrarna har egna minnesgränser eftersom resurssupervisorn inte mäter Docker Desktop-VM:n som en del av kommandots processträd.

På en annan dator med Docker Compose kan tjänsten startas direkt:

```sh
docker compose up --build -d
docker compose ps
```

Öppna [http://localhost:3210](http://localhost:3210). Logga in med `admin@planroom.local` och ditt `SEED_ADMIN_PASSWORD`. Du måste ersätta startkontots namn, e-postadress och lösenord innan dokument eller API-nycklar blir tillgängliga. Välj ett nytt lösenord med minst 12 tecken. Skapa därefter kollegornas konton under inställningar.

Databasen startas först. Appen väntar på databasen, kör versionsstyrda migrationer och seedar startkontot en gång. Exemplet **Orkestreraren i Eneo** importeras om `SEED_EXAMPLE=true`. En omstart återställer inte det ersatta adminlösenordet och skriver inte över dokument.

Appen binds till datorns loopback-adress och databasen exponeras inte. För åtkomst från kollegors datorer, följ [driftguiden](docs/DEPLOYMENT.md) och konfigurera en gemensam HTTPS-adress. `APP_URL` måste alltid matcha adressen användaren öppnar.

## Arbeta med en planering

1. Skapa en planering genom att importera HTML eller klistra in källkoden.
2. Lägg till instruktioner för fortsatt AI-arbete och en beskrivning.
3. Dela dokumentets länk i Mattermost. Mottagaren behöver ett konto i Planroom.
4. Redigera dokumentet eller låt en ansluten AI uppdatera det. Ange vad som ändrats.
5. Granska historiken eller återställ en äldre version. Återställning skapar en ny version och bevarar tidigare arbete.

En uppdatering bygger alltid på en uttrycklig version. Om en kollega hunnit spara före dig blir det en konflikt; läs den nya versionen och sammanför ändringarna innan du sparar igen. Ingen automatisk sammanslagning eller tyst överskrivning sker.

Osparade dokumentutkast finns tillfälligt kvar i samma webbläsarflik när du navigerar mellan sidor. Deras ursprungliga revision bevaras, så ett återöppnat utkast kan inte tyst skriva över en kollegas nyare version. Utkasten försvinner vid omladdning eller utloggning; spara en version för beständig lagring.

Rollerna är **administratör**, **redaktör** och **läsare**. Första versionen har en gemensam arbetsyta: alla färdigkonfigurerade användare kan läsa alla planeringar. Redaktörer och administratörer kan ändra dem. Dokumentvisa behörigheter och publik länkdelning ingår inte.

## Anslut en AI via MCP

MCP-servern startar automatiskt med appen på `/api/mcp` och kör i samma container. Öppna **Inställningar → AI och API** för separata anslutningsguider för **Codex**, **Claude Code** och **Claude Desktop**, med kopierbara konfigurationer och instruktioner för personliga nycklar.

Claude Desktop använder den valfria Compose-tjänsten `mcp-bridge` som en lokal stdio-brygga. Desktop startar och avslutar den lilla containern när anslutningen används. Bryggan anropar appens befintliga HTTP-server och har varken egen dokumentlagring, databasuppgifter eller en exponerad port. Den startas inte som en extra server vid vanlig `docker compose up`; appen behöver vara igång innan Desktop ansluter.

Skapa en personlig API-nyckel i inställningarna. Välj läsåtkomst eller skrivåtkomst; nyckeln visas bara vid skapandet. Återkalla den i samma vy om den inte längre behövs. En nyckel ger aldrig högre behörighet än dess användarkonto.

Konfigurera AI-klienten med:

| Inställning | Värde                                           |
| ----------- | ----------------------------------------------- |
| Transport   | Streamable HTTP                                 |
| URL lokalt  | `http://localhost:3210/api/mcp`                 |
| HTTP-header | `Authorization: Bearer <din-personliga-nyckel>` |

Klienten behöver kunna nå tjänstens adress och stödja egna autentiseringsheaders. En AI-klient i molnet kan inte nå datorns `localhost`; använd då tjänstens gemensamma HTTPS-adress. Planroom tillhandahåller personliga bearer-nycklar, ingen OAuth-inloggning.

AI:n kan läsa planeringens HTML och instruktioner, arbeta vidare och spara en revision med en ändringsbeskrivning. Skrivningar kräver aktuell revision, precis som i webben. Be AI:n läsa om dokumentet vid en konflikt. Instruktioner i importerade dokument är innehåll att bedöma, inte en behörighet att kringgå tjänstens regler.

REST-kontrakt och endpointlista finns i [docs/CONTRACT.md](docs/CONTRACT.md).

## HTML-visning

HTML-källan lagras oförändrad. Förhandsvisningen körs i en isolerad iframe med inline-CSS och SVG. JavaScript är avstängt som standard. Läsaren kan uttryckligen aktivera interaktivitet för att prova demonstrationer. Importerat innehåll körs aldrig i appens egen DOM.

Förhandsvisningen anger `about:srcdoc` som dokumentets bas så att avsnittslänkar, exempelvis `#arkitektur`, navigerar inom HTML-dokumentet. Dokumentets egna basadresser kan inte styra om länkar till externa sidor. JavaScript-baserade flikar behöver fortfarande att läsaren aktiverar interaktivitet.

Förhandsvisningens säkerhetspolicy blockerar externa resurser, skript, typsnitt, bilder, formulär och vanliga nätverksanrop. Iframen får inte tillgång till appens session. HTML som behöver externa resurser kan därför se annorlunda ut. Gör planeringsfiler fristående genom att bädda in resurser.

Aktivera interaktivitet endast för innehåll du litar på: JavaScript kan navigera sin egen iframe och därigenom överföra dokumentdata till en extern adress. Isoleringen är inte en garanti mot sådan överföring. Val i ett interaktivt exempel är tillfälliga; sparade beslut hör hemma i dokumentet eller kommentarerna.

HTML-export är originalkällan. Öppnar du exporten direkt i en webbläsare gäller inte längre Planrooms isolering.

## Utveckling och verifiering

Node.js 22 används lokalt och i Docker. Installation och fokuserade kontroller på denna Mac ska alltid köras genom den gemensamma resurssupervisorn:

```sh
python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 600 -- npm ci
python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 120 -- npm run typecheck
python3 /Users/maxeriksson/.codex/scripts/run-guarded.py --seconds 120 -- npm test -- tests/contracts.test.ts
```

Alla tester använder en arbetare. Starta inte lokala utvecklingsservrar, produktionsbyggen eller fulla testsamlingar utan uttrycklig begäran. Databasintegrationstester kräver en särskilt tillhandahållen engångsdatabas via `TEST_DATABASE_URL`; använd aldrig en databas med verkligt innehåll. CI kör typkontroll, tester med PostgreSQL 17, Dockerbygge och en begränsad uppstartskontroll på en separat GitHub-runner.

Se [arkitekturen](docs/ARCHITECTURE.md) för ansvarsfördelning och [driftguiden](docs/DEPLOYMENT.md) för uppdatering, backup och återställning. Revisionshistorik ersätter inte en databasbackup.
