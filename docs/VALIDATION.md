# Verifiering av första versionen

Kontrollerat lokalt 2026-09-30. Tunga kommandon kördes via den globala resurssupervisorn, med en arbetare. Dockerbygget begränsades separat till 2 GiB minne och en CPU.

| Kontroll                                       | Resultat                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| TypeScript, `npm run typecheck`                | Godkänd                                                              |
| Fem fokuserade testfiler                       | 42 tester godkända                                                   |
| PostgreSQL 17 i separat engångscontainer       | 7 integrationstester godkända                                        |
| `npm audit --omit=dev --audit-level=high`      | Inga rapporterade sårbarheter                                        |
| Docker-produktionsbygge                        | Godkänt                                                              |
| Compose-uppstart med migration och engångsseed | App och databas friska                                               |
| HTTP-kontroll mot körande Docker-app           | Hälsa, headers, startinloggning och obligatoriskt kontobyte godkända |
| Inloggningssida i webbläsaren                  | Visuellt granskad, inga konsolfel eller varningar                    |

Integrationstesterna täcker oförändrad HTML, immutabla revisioner, samtidiga uppdateringar med versionskonflikt, återställning, roller, bootstrap som inte återställs, credentialrotation och det riktiga MCP-protokollet via den officiella klienten. Samtidig kontorotation blockerar både inloggning med gamla uppgifter och utfärdande av nya nycklar från återkallade sessioner.

Visningens HTML-parsertester kontrollerar att originalkällan och SVG bevaras medan säkerhetspolicyn ligger först, även vid missformad HTML. Navigationstesterna täcker intern sidnavigation, ankarlänkar, nedladdning och nya flikar.

Ingen fullständig automatiserad webbläsartestning eller WCAG-certifiering har genomförts. Första användarens kontobyte lämnas till användaren. GitHub CI är konfigurerad men har inte körts eftersom repot ännu är lokalt.

Temporära databaser och byggcontainrar städades bort. Endast den avsedda Planroom-appen och dess databas lämnades igång. Databasen innehåller startkontot och exempelplaneringen, vardera en gång.

## Navigation och MCP-guider

Kontrollerat lokalt 2026-09-30 efter första implementationen. Typkontrollen och 43 tester i fem fokuserade testfiler för MCP, Desktop-bryggan, klientkonfigurationer, HTML-visning och kontrakt godkändes. Bryggan testas med den officiella MCP-klienten genom en riktig stdio-process och en transportfixture; testerna kontrollerar bevarad HTML, skrivbehörighet, läsbehörighet och versionskonflikter. Konfigurationstesterna kontrollerar bland annat den aktuella serveradressen och Claude Codes bokstavliga miljövariabel.

Manuell kontroll i den befintliga inloggade Chrome-sessionen visade att klick på kortets beskrivning öppnar planeringen, att Astryx fokusram följer inmatningsfältets rundade kant och att de separata guiderna för Codex, Claude Code och Claude Desktop visas med korrekt lokal endpoint. Ingen riktig klientkonfiguration eller personlig åtkomstnyckel har skapats av testet.

Docker-bryggan provades även med en ogiltig testnyckel: anslutningen misslyckades och engångscontainern städades bort. Den ordinarie appen och databasen lämnades friska och igång. Kontot som användaren redan har bytt till behölls.

Efter den slutliga korrigeringen godkändes Docker-produktionsbygget och Compose-uppstarten. I Chrome klickades länken Arkitekturskiss i originalexemplet med JavaScript avstängt: visningsramen fick `about:srcdoc#arkitektur` och skrollade till rätt avsnitt utan localhost-fel. Original-HTML och databasens revisioner ändrades inte.
