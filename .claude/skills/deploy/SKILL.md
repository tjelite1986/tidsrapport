---
name: deploy
description: Deployar tidsrapport till Pi:n via CI-flödet (push → GitHub Actions bygger imagen → scripts/deploy.sh drar och startar om containern). Hanterar även databasmigrering.
argument-hint: "[migration-version, t.ex. v20]"
allowed-tools: Bash(npm run build:*), Bash(npm test:*), Bash(git -C /home/thomas/code/tidsrapport:*), Bash(bash /home/thomas/code/tidsrapport/scripts/deploy.sh:*), Bash(gh run:*), Bash(docker exec:*), Bash(docker ps:*), Bash(docker logs:*)
---

Tidsrapports image byggs av GitHub Actions, inte på Pi:n. Ett deploy är alltså
"pusha till master och rulla ut den image CI byggde" — kör ALDRIG
`docker compose build` eller `up -d --build` för det här projektet
(compose-filen använder `image: ghcr.io/tjelite1986/tidsrapport:latest`, det
finns ingen `build:`-sektion att bygga).

## Steg 1 – Verifiera lokalt

```bash
cd /home/thomas/code/tidsrapport
npm test        # vitest golden payslip-suite — samma gate som CI kör först
npm run build
```

Misslyckas något: stoppa och rapportera. Pusha INTE — CI kör samma tester och
`build-and-push` startar ändå inte om `test`-jobbet faller.

## Steg 2 – Committa och pusha

```bash
git -C /home/thomas/code/tidsrapport add <filer>
git -C /home/thomas/code/tidsrapport commit -m "..."
git -C /home/thomas/code/tidsrapport push origin master
```

Pushen triggar workflowet `Build & Push Docker image`: jobbet `test` kör
`npm test`, därefter bygger `build-and-push` en multi-arch image (arm64 +
amd64) och pushar den till `ghcr.io/tjelite1986/tidsrapport:latest`.

## Steg 3 – Rulla ut

```bash
bash /home/thomas/code/tidsrapport/scripts/deploy.sh
```

Använd absolut sökväg — skalets cwd är inte nödvändigtvis projektroten.
Bygget tar oftast 3–15 min, så kör i bakgrunden och läs utdatan när jobbet är
klart hellre än att blockera i förgrunden.

Skriptet gör allt det manuella flödet gör, men utan racet: det nycklar på
HEAD:s sha (inte `gh run list --limit 1`, som kan träffa en gammal körning),
pollar just den körningen till terminalt tillstånd, avbryter om CI inte blev
grön, kör sedan `docker compose pull && up -d` i
`/home/thomas/docker2/tidsrapport` och verifierar att containerns image-id
faktiskt byttes. `image unchanged` i utskriften betyder att Watchtower hann
före eller att det inte fanns något nytt — inte att deployen misslyckades.

Watchtower drar annars ny image inom en timme av sig själv; skriptet används
när utrullningen ska ske nu och bekräftas.

Om skriptet inte kan användas (t.ex. `gh` trasigt), manuellt:

```bash
unset DOCKER_HOST
cd /home/thomas/docker2/tidsrapport && docker compose pull && docker compose up -d
```

## Steg 4 – Databasmigrering (om angiven)

Om användaren angav ett migrations-argument (t.ex. "v20"), kör i containern —
DB:n ligger i en volym, inte i repot:

```bash
docker exec tidsrapport npx tsx scripts/migrate-$ARGUMENTS.ts /app/data/tidsrapport.db
```

Om inget argument angavs: fråga bara om ändringen faktiskt rörde schemat
(`lib/db/schema.ts` eller ett nytt `scripts/migrate-v*.ts`). En ren UI- eller
assetändring behöver ingen migration.

Senaste migrationen: **v19** (lönebeskedsuppgifter på user_settings) — nästa
lediga är v20. Observera att v17–v19 kör sig själva: v17/v18 vid första anropet
mot `lib/payslips/store.ts` och v19 vid modulinit i `lib/db/index.ts`, så de
behöver inte köras för hand efter ett deploy.
DB-sökväg i container: `/app/data/tidsrapport.db`

## Steg 5 – Kontrollera loggarna

```bash
docker ps --filter name=tidsrapport --format '{{.Names}} {{.Status}}'
docker logs tidsrapport --tail 20
```

Rapportera eventuella ERROR/WARN.

## Klart

Bekräfta att https://tidrapport.mecloud.win svarar. Efter en UI-ändring:
hård-refresha PWA:n — service workern cachar JS-bundlen.
