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
v2 → v3 → v4 → v5 → v6 → v7 → v8 → v9 → v10 → v11 → v12 → v13 (senaste)
Nästa: **v14**. Kör i container: `docker exec tidsrapport npx tsx scripts/migrate-vN.ts /app/data/tidsrapport.db`

## Deploy
```bash
git push origin master   # räcker — CI bygger och Watchtower uppdaterar Pi:n automatiskt
```

Manuell kontroll om något är fel:
```bash
unset DOCKER_HOST
cd /home/thomas/docker2/tidsrapport && docker compose pull && docker compose up -d
docker logs tidsrapport --tail 20
```

## CI/CD-flöde (apr 2026)
1. `git push origin master` → GitHub Actions bygger multi-arch image (arm64 + amd64)
2. Image pushas till `ghcr.io/tjelite1986/tidsrapport:latest` (publikt paket)
3. Watchtower på Pi:n kollar varje timme → drar ny image → startar om containern
- Compose-filen använder `image: ghcr.io/tjelite1986/tidsrapport:latest`, INTE lokal `build:`
- Watchtower: `/home/thomas/docker2/watchtower/docker-compose.yml`
- Kör ALDRIG `docker compose build` för tidsrapport — imagen byggs av CI

## Dockerfile — multi-stage build (optimerad apr 2026)
- **builder**: `node:20-alpine` + `python3 make g++` — kompilerar better-sqlite3, kör `npm run build`
- **runner**: `node:20-alpine` utan byggsverktyg — Next.js `standalone`-output buntar JS-beroenden
- Runner kopierar bara `better-sqlite3`, `bindings`, `file-uri-to-path` (enda native-modulen)
- Fullständiga `node_modules` kopieras INTE till runner — minskar imagen från 1.33 GB → 250 MB
- Lägg ALDRIG till `python3 make g++` i runner-steget igen

## Varningar
- `lib/tax-tables/data-*.json` är 323 KB/st — läs INTE dessa filer, använd `lib/tax-tables/tax-lookup.ts`
- `node_modules/`, `.next/` — läs aldrig
- Timer-state sparas i localStorage med nyckeln `tidsrapport-timer`

---

# SQL Database Assistant

Aktiveras vid: SQL-queries, query-optimering, Drizzle ORM, migrations, schema-utforskning.

## SQLite-specifikt (detta projekt)

```sql
-- Schema-dump
SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name;
-- Kolumninfo
PRAGMA table_info(tabellnamn);
```

- Migrations: kontrollera alltid `PRAGMA table_info` innan `ALTER TABLE`
- Backup: `sqlite3 data/tidsrapport.db ".backup backup.db"`
- ORM: Drizzle — `db.select().from(table).where(eq(table.col, val))`
- Migrations genereras med: `npx drizzle-kit generate` sedan `npx drizzle-kit push`

## Query-optimering

| Anti-mönster | Problem | Fix |
|---|---|---|
| `SELECT *` | Onödig data | Explicit kolumnlista |
| N+1 queries | En fråga per rad | Eager loading / batch med `WHERE id IN (...)` |
| Utan LIMIT | Kan returnera hela tabellen | Paginera alltid |
| Implicit typkonvertering | Hindrar indexanvändning | Matcha typer i predicate |
| Pengar som FLOAT | Avrundningsfel | `INTEGER` (ören) eller `NUMERIC` |

## Zero-downtime migrations (SQLite)

```sql
-- Lägg till kolumn (säkert)
ALTER TABLE users ADD COLUMN phone TEXT;

-- Byt namn (expand-contract):
-- 1. Lägg till ny kolumn
-- 2. Backfill
-- 3. Uppdatera kod att skriva till ny
-- 4. Ta bort gammal kolumn
```

## Drizzle ORM-mönster

```typescript
// Schema
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

// Query
db.select().from(users).where(eq(users.email, email))

// Upsert
db.insert(users).values(data).onConflictDoUpdate({ target: users.email, set: data })
```

---

# Next.js App Router Patterns

Aktiveras vid: routes, layouts, API-routes, Server Actions, formulär, datahämtning.

## Server vs Client Components

Default är Server Component — lägg till `'use client'` bara när det behövs:

```tsx
// Server Component (default) — async/await direkt
export default async function Page() {
  const data = await db.select().from(users);
  return <div>{data[0].name}</div>;
}

// Client Component — krävs för events, hooks, browser-API
'use client';
import { useState } from 'react';
export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

## Route File Conventions

```
app/
  layout.tsx        # Root layout
  page.tsx          # /
  loading.tsx       # Suspense-boundary (automatisk)
  error.tsx         # Error boundary (måste vara 'use client')
  api/
    route.ts        # API-route
  [id]/
    page.tsx        # /[id]
```

## Server Actions (formulär utan API-route)

```tsx
// lib/actions.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function saveReport(formData: FormData) {
  const date = formData.get('date') as string;
  // Spara till DB...
  revalidatePath('/rapporter');
}

// Användning i komponent
export function ReportForm() {
  return (
    <form action={saveReport}>
      <input name="date" type="date" required />
      <button type="submit">Spara</button>
    </form>
  );
}
```

## API Route Handler

```tsx
// app/api/rapporter/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const month = searchParams.get('month');

  return NextResponse.json({ data: [] });
}
```

## Zod + React Hook Form

```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  date: z.string().min(1, 'Datum krävs'),
  hours: z.number().min(0).max(24),
});
type FormData = z.infer<typeof schema>;

export function TimeForm() {
  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    await fetch('/api/rapporter', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <input {...form.register('date')} type="date" />
      {form.formState.errors.date && <p>{form.formState.errors.date.message}</p>}
      <button type="submit" disabled={form.formState.isSubmitting}>Spara</button>
    </form>
  );
}
```

## Tailwind — vanliga mönster

```tsx
// Responsiv grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Flexbox centrering
<div className="flex items-center justify-between gap-2">

// Konditionella klasser (kräver clsx eller cn())
import { cn } from '@/lib/utils';
<div className={cn('base', isActive && 'bg-blue-500', className)}>

// Hover + transition
<button className="hover:bg-blue-600 transition-colors duration-200">
```

## Anti-mönster att undvika

```tsx
// Fel: params utan await (Next.js 15 — gäller ej Next.js 14)
// I Next.js 14 är params fortfarande synkrona

// Fel: fetch i Client Component när Server Component fungerar
'use client';
useEffect(() => { fetch('/api/data')... }, []); // Onödig

// Fel: 'use client' på hela sidor utan anledning
// Håll sidor som Server Components, extrahera interaktiva delar

// Fel: userId från query-params istället för session
// Alltid: const session = await getServerSession(authOptions)
```
