---
name: new-migration
description: Skapar ett nytt migrations-script för tidsrapport-databasen med korrekt versionsnummer och boilerplate-kod.
argument-hint: "[beskrivning av ändringen]"
allowed-tools: Glob(scripts/migrate-v*.ts), Read, Write, Edit
---

Följ dessa steg för att skapa en ny migration:

## Steg 1 – Räkna ut nästa versionsnummer

Hitta alla befintliga migrate-filer:

```
scripts/migrate-v*.ts
```

Ta det högsta numret och lägg till 1. Om v9 är högst → skapa v10.

## Steg 2 – Skapa migrations-scriptet

Skapa `scripts/migrate-vN.ts` med följande boilerplate:

```typescript
import Database from 'better-sqlite3'
import path from 'path'

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db')
const db = new Database(dbPath)

console.log(`Running migration vN on: ${dbPath}`)

db.exec(`PRAGMA journal_mode=WAL`)

// Kontrollera om kolumnen/tabellen redan finns innan ALTER TABLE
const tableInfo = db.prepare(`PRAGMA table_info(table_name)`).all() as { name: string }[]
const columnExists = tableInfo.some(col => col.name === 'column_name')

if (!columnExists) {
  db.exec(`
    ALTER TABLE table_name ADD COLUMN column_name TEXT NOT NULL DEFAULT 'default_value'
  `)
  console.log('Added column: column_name')
} else {
  console.log('Column already exists, skipping')
}

console.log('Migration vN complete')
db.close()
```

Anpassa boilerplate efter `$ARGUMENTS` (beskrivning av vad som ska ändras).

## Steg 3 – Lägg till npm-script i package.json

Lägg till i `"scripts"`-objektet i `package.json`:

```json
"db:migrate-vN": "npx tsx scripts/migrate-vN.ts data/tidsrapport.db"
```

## Steg 4 – Bekräfta

Visa det skapade scriptet och be användaren granska det innan migration körs.

## Viktigt
- Använd ALLTID `PRAGMA table_info` för att kontrollera om kolumn/tabell redan finns
- Ange alltid `data/tidsrapport.db` som default-sökväg i scriptet
- Container-sökväg vid docker exec: `/app/data/tidsrapport.db`
