---
name: verify
description: Kör verify-salary och/eller debug-ob mot lokal databas för att kontrollera löneberäkningar mot lönebesked.
argument-hint: "[månad YYYY-MM | ob | all]"
allowed-tools: Bash(npx tsx scripts/verify-salary.ts:*), Bash(npx tsx scripts/verify-jan.ts:*), Bash(npx tsx scripts/debug-ob.ts:*), Bash(npx tsx scripts/generate-comparison-pdf.ts:*)
---

Kör verifierings-scripts mot lokal databas.

## DB-sökväg
```
data/tidsrapport.db
```

## Kommandon baserat på argument

**`$ARGUMENTS` = "ob"** — visa OB-detaljer per dag:
```bash
npx tsx scripts/debug-ob.ts data/tidsrapport.db
```

**`$ARGUMENTS` = "jan"** — specifik januari-verifiering:
```bash
npx tsx scripts/verify-jan.ts data/tidsrapport.db
```

**`$ARGUMENTS` = "pdf"** — generera lönejämförelse-PDF:
```bash
npx tsx scripts/generate-comparison-pdf.ts data/tidsrapport.db
```

**`$ARGUMENTS` = YYYY-MM (t.ex. "2025-11")** — verifiera en specifik månad:
```bash
npx tsx scripts/verify-salary.ts data/tidsrapport.db
```
(Scriptet frågar interaktivt om månad, eller skicka som argument om scriptet stödjer det.)

**Inget argument / "all"** — kör verify-salary:
```bash
npx tsx scripts/verify-salary.ts data/tidsrapport.db
```

## Tolkning av resultat

- Diff < 50 kr på netto = acceptabelt (registreringsskillnader)
- Diff i OB 50%: 0.17h är känd avvikelse, ej bugg
- Mertid finns ej i DB — syns alltid som diff i jun 2025 och jan 2026
- Stora diff: kontrollera debug-ob för att isolera vilket OB-segment som avviker

## Kända avvikelser
- Mertid saknas (juni: 14.5h, januari: 17.25h)
- December 2025: sjuklön/VAB/karens — komplex
- Tidiga månader (jun-sep 2025): Android-registreringsskillnader
