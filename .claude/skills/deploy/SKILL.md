---
name: deploy
description: Bygger och deployr tidsrapport-appen till Docker. Kör npm build, docker compose och eventuell databasmigrering.
argument-hint: "[migration-version, t.ex. v10]"
allowed-tools: Bash(npm run build:*), Bash(cd /home/thomas/docker*), Bash(docker compose up:*), Bash(docker exec:*), Bash(docker ps:*), Bash(docker logs:*)
---

Följ dessa steg för att deploya tidsrapport:

## Steg 1 – Verifiera bygget lokalt

```bash
cd /home/thomas/projekt/tidsrapport
npm run build
```

Om bygget misslyckas, stoppa och rapportera felet. Deploya INTE vid build-fel.

## Steg 2 – Bygg och starta Docker-containern

```bash
cd /home/thomas/docker && docker compose up -d tidsrapport --build
```

Vänta tills containern är igång. Verifiera med:

```bash
docker ps | grep tidsrapport
```

## Steg 3 – Kör databasmigrering (om angiven)

Om användaren angav ett migrations-argument (t.ex. "v10"), kör:

```bash
docker exec tidsrapport npx tsx scripts/migrate-$ARGUMENTS.ts /app/data/tidsrapport.db
```

Om inget argument angavs, fråga: "Behöver du köra en migration? (ange t.ex. v10, eller nej)"

Senast kända migration: **v9** (se @.claude/architecture.md för schema-info)
DB-sökväg i container: `/app/data/tidsrapport.db`

## Steg 4 – Kontrollera loggarna

```bash
docker logs tidsrapport --tail 20
```

Rapportera om det finns ERROR eller WARN i loggarna.

## Klart

Bekräfta att appen är tillgänglig på https://tidrapport.mecloud.win
