# Drift av Planroom

## Konfiguration

Docker Compose startar PostgreSQL 17 och appen på Node.js 22. PostgreSQLs namngivna volym bevaras när containrarna stoppas eller ersätts. Appcontainern kör som en användare utan root-rättigheter, med skrivskyddat filsystem och tillfälliga skrivbara kataloger för cache. Migrationer och seeding körs före webbservern; appen börjar inte ta emot trafik om ett steg misslyckas.

| Variabel                | Betydelse                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`     | Separat slumpmässigt databaslösenord. Använd hexsträng från `openssl rand -hex 24`.                  |
| `SEED_ADMIN_PASSWORD`   | Startkontots slumpmässiga lösenord. Krävs i Compose, används endast när startkontot skapas.          |
| `SEED_ADMIN_EMAIL`      | Startkontots e-post, som standard `admin@planroom.local`.                                            |
| `SEED_EXAMPLE`          | `true` importerar det bifogade exemplet en gång.                                                     |
| `APP_URL`               | Exakt publik adress med protokoll och port. Styr kontroll av samma origin och säkra sessionscookies. |
| `PLANROOM_PORT`         | Värddatorns port, som standard `3210`.                                                               |
| `PLANROOM_BIND_ADDRESS` | Som standard `127.0.0.1`, endast åtkomligt från värddatorn.                                          |

Skydda `.env` som en hemlighet, till exempel med `chmod 600 .env`. Den ska aldrig checkas in. En ändring av `POSTGRES_PASSWORD` i `.env` ändrar inte lösenordet i en redan skapad databas: rotera databasrollen och konfigurationen tillsammans. En ändring av `SEED_ADMIN_PASSWORD` återställer inte startkontot.

Compose begränsar appen till 1 GiB minne och en CPU, och PostgreSQL till 512 MiB och en CPU. Node får högst 768 MiB JavaScript-heap i appcontainern. Dessa containergränser gäller körning; Dockerbygget har andra resurser och bör köras i CI eller under den lokala supervisorn när ett bygge uttryckligen begärs.

## Gemensam åtkomst

Placera tjänsten bakom er befintliga HTTPS-proxy och sätt exempelvis `APP_URL=https://planroom.example.se`. Behåll loopback-bindningen om proxyn kör på samma värd. Om proxyn kör i en egen container, anslut den till Compose-nätverket och skicka trafiken till `app:3000`; välj nätverkskopplingen med er driftmiljö.

Proxyn behöver stödja MCP:s Streamable HTTP, utan svarsbuffring som hindrar strömmande svar, och bör begränsa storleken på inkommande HTTP-bodies. Kör inte detta förstautkast publikt med okrypterad HTTP. PostgreSQL ska fortsätta vara intern.

Webbens inloggning använder sessionscookies. API/MCP använder personliga bearer-nycklar; MCP accepterar inte en webbcookie som autentisering. Varje token begränsas av användarens roll och vald läs- eller skrivåtkomst. Nycklar kan återkallas och lagras bara som hash i databasen. Kontoändring med nytt lösenord avslutar äldre sessioner och återkallar användarens API-nycklar.

Första versionen saknar fler arbetsytor, dokumentvisa behörigheter, SSO/OAuth, bilagelagring och automatisk Mattermost-publicering. Den är avsedd för en betrodd grupp med individuella konton.

JavaScript i importerad HTML är avstängt som standard. Iframen använder en separat origin och en restriktiv policy för externa resurser. Om en läsare aktiverar interaktivitet kan godtycklig JavaScript fortfarande navigera sin egen iframe och överföra dokumentdata. Aktivera därför endast demonstrationer från betrott innehåll; isoleringen ska inte beskrivas som en fullständig garanti mot dataöverföring.

## Hälsa och felsökning

```sh
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 db
curl --fail http://localhost:3210/api/health
```

Hälsoendpointen är avsiktligt publik och returnerar endast databasens tillgänglighet, inga dokument eller användaruppgifter. Kontrollera `APP_URL` om sparningar eller inloggning får ett origin-fel. Om databasväntan eller en migration misslyckas, undersök loggen och konfigurationen; tjänsten hoppar inte över migrationer för att ändå starta.

`docker compose down` stoppar tjänsten och bevarar data. `docker compose down -v` raderar datavolymen och allt innehåll. Använd det senare endast för en avsiktlig återställning av en engångsmiljö.

## Backup

En revision skyddar mot felaktiga innehållsändringar. En databasbackup skyddar även användare, kommentarer och historik när databasen eller värddatorn förloras. Kör regelbundet följande från repots rot:

```sh
mkdir -p backups
chmod 700 backups
docker compose exec -T db pg_dump -U planroom -d planroom -Fc > backups/planroom.dump
chmod 600 backups/planroom.dump
```

Kontrollera att kommandot lyckades och att dumpen går att återställa i en separat testmiljö. Kopiera lyckade backuper till en separat, skyddad lagringsplats och ha en retentionpolicy. Säkerhetskopiera även `.env` och vilken Git-version/image som användes, separat från databasen. Dumpen innehåller planeringar och autentiseringshashar och ska behandlas som känslig.

## Återställning

Återställ först i en separat miljö. Följande kommandon **ersätter innehållet i den aktuella Planroom-databasen**; använd dem endast för ett avsiktligt återställningsförfarande med en verifierad backup. Stoppa appen så att den inte skriver under återställningen:

```sh
docker compose stop app
docker compose exec -T db pg_restore -U planroom -d planroom --clean --if-exists --exit-on-error < backups/planroom.dump
docker compose up -d app
```

Använd samma appversion som skapade backupen, eller en senare version med tillämpliga migrationer. Kontrollera hälsa, inloggning, dokument och historik efteråt. Återställning återför också konton, sessioner och nycklar till backupens tidpunkt; återkalla berörda nycklar om de kan ha läckt sedan dess.

## Uppdatering och återgång

Ta en verifierad backup innan du uppdaterar. Hämta den granskade kodversionen och bygg/starta appen:

```sh
docker compose up --build -d app
docker compose ps
```

Uppstarten kör bara migrationer som inte redan registrerats. Migrationer är versionsstyrda och ska aldrig ändras efter att de har körts i en delad miljö. Spara tidigare Git-version eller Dockerimage. Om en uppdatering förändrar databasschemat och måste återgå, stoppa appen och återställ både föregående appversion och backup i stället för att gissa på nedåtmigrationer. Ta även en kopia av nuvarande databas innan återgång, så att senare ändringar kan granskas och återföras.
