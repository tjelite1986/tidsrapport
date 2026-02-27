# Tidsrapport – Claude Code Instructions

## Stack
Next.js 14 (App Router), SQLite via better-sqlite3 + Drizzle ORM, NextAuth JWT, Tailwind CSS.
DB: `data/tidsrapport.db` | Container-DB: `/app/data/tidsrapport.db`

## Arkitektur
Se `.claude/architecture.md` för fullständig filstruktur och API-referens.

## Konventioner
- Datumhantering: använd ALLTID lokala datumkomponenter — ALDRIG `toISOString()` (ger UTC-shift)
- API-auth: `getServerSession(authOptions)` i varje route — aldrig userId från query utan session
- Pengar: SEK, `sv-SE` locale
- Migrationer: `scripts/migrate-vN.ts`, kontrollera alltid `PRAGMA table_info` innan ALTER TABLE
- Admin kan EJ se andra användares löne- eller rapportdata

## Migrations-ordning
v2 → v3 → v4 → v5 → v6 → v7 → v8 → v9 (senaste)
Nästa: **v10**. Kör i container: `docker exec tidsrapport npx tsx scripts/migrate-vN.ts /app/data/tidsrapport.db`

## Deploy
```bash
npm run build                                                        # verifiera lokalt
cd /home/thomas/docker && docker compose up -d tidsrapport --build  # bygg + starta
docker logs tidsrapport --tail 20                                    # kontrollera
```
Eller använd `/deploy` (skill).

## Varningar
- `lib/tax-tables/data-*.json` är 323 KB/st — läs INTE dessa filer, använd `lib/tax-tables/tax-lookup.ts`
- `node_modules/`, `.next/` — läs aldrig
- Timer-state sparas i localStorage med nyckeln `tidsrapport-timer`
