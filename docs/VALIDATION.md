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
