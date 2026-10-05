# Tidsrapport – Claude Code Instructions

## Stack
Next.js 14 (App Router), SQLite via better-sqlite3 + Drizzle ORM, NextAuth JWT, Tailwind CSS.
DB: `data/tidsrapport.db` | Container DB: `/app/data/tidsrapport.db`

## Architecture
See `.claude/architecture.md` for the full file structure and API reference.

## Conventions
- Dates: ALWAYS use local date components — NEVER `toISOString()` (it shifts to UTC)
- API auth: `getServerSession(authOptions)` in every route — never take userId from the query without a session
- Money: SEK, `sv-SE` locale
- Migrations: `scripts/migrate-vN.ts`, always check `PRAGMA table_info` before ALTER TABLE
- An admin can NOT see other users' salary or report data

## Migration order
v2 → … → v14 (per-user projects) → v15 (hourly_rate_history) → v16 (vacation_daily_rate) → v17 (payslips) → v18 (salary lines on payslips) → v19 (payslip document fields on user_settings, latest)
Next: **v20**. Run inside the container: `docker exec tidsrapport npx tsx scripts/migrate-vN.ts /app/data/tidsrapport.db`
v17 and v18 also run on the first call (`lib/payslips/store.ts`: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` behind `PRAGMA table_info`) — so they need no manual run, but are kept for completeness.
v19 runs at module init in `lib/db/index.ts` (`applyUserSettingsColumns`), i.e. before the first query against `user_settings` — otherwise every read of the table would have crashed until the migration was run by hand.

## Deploy
```bash
git push origin master   # enough — CI builds and Watchtower updates the Pi automatically
scripts/deploy.sh        # deploy HEAD right away: finds the matching CI run, polls to completion, pull + up -d, verifies the image changed
```
`scripts/deploy.sh` avoids a race: it keys on the HEAD sha (not `gh run list --limit 1`) and confirms that the container image actually changed. After a UI change: hard-refresh the PWA (cached JS).

Manual check if something is wrong:
```bash
unset DOCKER_HOST
cd /home/thomas/docker2/tidsrapport && docker compose pull && docker compose up -d
docker logs tidsrapport --tail 20
```

## CI/CD flow (Apr 2026)
1. `git push origin master` → GitHub Actions builds a multi-arch image (arm64 + amd64)
2. The image is pushed to `ghcr.io/tjelite1986/tidsrapport:latest` (public package)
3. Watchtower on the Pi checks hourly → pulls the new image → restarts the container
- The compose file uses `image: ghcr.io/tjelite1986/tidsrapport:latest`, NOT a local `build:`
- Watchtower: `/home/thomas/docker2/watchtower/docker-compose.yml`
- NEVER run `docker compose build` for tidsrapport — the image is built by CI

## Dockerfile — multi-stage build (optimized Apr 2026)
- **builder**: `node:20-alpine` + `python3 make g++` — compiles better-sqlite3, runs `npm run build`
- **runner**: `node:20-alpine` without build tools — Next.js `standalone` output bundles the JS dependencies
- The runner copies only `better-sqlite3`, `bindings`, `file-uri-to-path` (the only native module)
- Full `node_modules` is NOT copied to the runner — it cuts the image from 1.33 GB → 250 MB
- NEVER add `python3 make g++` back to the runner stage

## Payslips (uploaded files)
- Metadata in the `payslips` table, the file on disk in `data/payslips/<userId>/` — same volume as the database, so a backup must include all of `data/`
- The file type is decided by magic bytes (`detectPayslipType`), never by filename or `file.type` — an HTML login page named `.pdf` is rejected with 415
- The stored name is the app's own (`YYYY-MM-<uuid>.<ext>`); the user's filename is kept for display only
- `/api/payslips/[id]/file` is scoped to the owner and answers 404 (not 403) for someone else's id
- Payout month ≠ work period: a payslip for `2026-08` is compared against the salary calculation for `2026-07` (`workMonthFor`)
- AI extraction (`lib/payslips/extract.ts`, `/api/payslips/extract`): **OpenRouter first** — `ANTHROPIC_API_KEY` exists but has no credit. `OPENROUTER_MODEL` (default `anthropic/claude-opus-5`), `PAYSLIP_AI_PROVIDER=anthropic` forces the other path. A PDF is sent as a `file` part with `plugins: [file-parser, engine native]`, images as `image_url`. Cost ≈ 0.01–0.02 USD per payslip.
- The model should answer `null` rather than guess — the UI lists only the missing core fields (gross/tax/net), not every empty row
- Salary lines (v18): a payslip can be filled in with the same entries `/lon` computes — hours worked, hourly rate, base pay, OB per percentage rate, extra/overtime hours, sick pay, holiday pay and holiday compensation. The definition lives in `lib/payslips/fields.ts` (`PAYSLIP_FIELDS`); add new entries there, not in the UI
- OB is stored as JSON in `ob_lines` (`[{percent, hours, amount}]`) — always read it via `readObLines()`, never `JSON.parse` directly. The same percentage rate may appear only once
- The comparison is built server-side by `buildComparison()`: a percentage rate the calculation lacks counts as 0 kr (not "unknown"), and rows that are empty on both sides are hidden — except gross/tax/net

## Generated payslip document (PDF)
- `/lon` → "Exportera lönebesked" fetches `/api/salary/payslip?month=<payout month>` and draws the PDF client-side. The month is the **payout month**; the rows cover the work period of the month before (`workMonthFor`)
- The source data is built server-side in `lib/salary/payslip-document.ts` — header, holiday balances, accumulated columns and employer contributions. The accumulated columns recompute every earlier payout month in the same year (at most twelve `computeMonthlySalary` calls)
- The rows are built by `buildPayslipLines()` in `lib/pdf/payslip-lines.ts` (pure function, tested in `payslip-lines.test.ts`). **The amount column sums exactly to the paid-out amount** — that is why the row `996 Öresutjämning` exists. New entries go there, not in the generator
- Overtime hours are split out of the `10 Timlön` row and get a row of their own with the full hourly cost as unit price, otherwise quantity × unit price does not match the amount
- Holiday compensation that goes into the reserve does **not** appear among the rows — it is not paid out that month
- `lib/pdf/payslip-generator.ts` only draws. jsPDF's WinAnsi fonts lack U+00A0 and U+2212, so `fmt()` swaps them for ASCII — otherwise thousands separators and minus signs turn into boxes
- Header and footer data (employee number, addresses, org. number, bank account, payout day, employer contribution, message) are v19 columns on `user_settings` and are edited under Inställningar → "Uppgifter på lönebeskedet". None of it affects the salary calculation
- Columns the app has no source for (saved/advance/unpaid holiday days, comp-time balance, benefits) are written **empty**, never as 0

## Warnings
- `lib/tax-tables/data-*.json` are 323 KB each — do NOT read these files, use `lib/tax-tables/tax-lookup.ts`
- `node_modules/`, `.next/` — never read
- Timer state is kept in localStorage under the key `tidsrapport-timer`

---

# SQL Database Assistant

Applies to: SQL queries, query optimization, Drizzle ORM, migrations, schema exploration.

## SQLite-specific (this project)

```sql
-- Schema dump
SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name;
-- Column info
PRAGMA table_info(table_name);
```

- Migrations: always check `PRAGMA table_info` before `ALTER TABLE`
- Backup: `sqlite3 data/tidsrapport.db ".backup backup.db"`
- ORM: Drizzle — `db.select().from(table).where(eq(table.col, val))`
- Migrations are generated with: `npx drizzle-kit generate` then `npx drizzle-kit push`

## Query optimization

| Anti-pattern | Problem | Fix |
|---|---|---|
| `SELECT *` | Unnecessary data | Explicit column list |
| N+1 queries | One query per row | Eager loading / batch with `WHERE id IN (...)` |
| No LIMIT | May return the whole table | Always paginate |
| Implicit type conversion | Prevents index use | Match types in the predicate |
| Money as FLOAT | Rounding errors | `INTEGER` (minor units) or `NUMERIC` |

## Zero-downtime migrations (SQLite)

```sql
-- Add a column (safe)
ALTER TABLE users ADD COLUMN phone TEXT;

-- Rename (expand-contract):
-- 1. Add the new column
-- 2. Backfill
-- 3. Update the code to write to the new one
-- 4. Drop the old column
```

## Drizzle ORM patterns

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

Applies to: routes, layouts, API routes, Server Actions, forms, data fetching.

## Server vs Client Components

The default is a Server Component — add `'use client'` only when needed:

```tsx
// Server Component (default) — async/await directly
export default async function Page() {
  const data = await db.select().from(users);
  return <div>{data[0].name}</div>;
}

// Client Component — required for events, hooks, browser APIs
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
  loading.tsx       # Suspense boundary (automatic)
  error.tsx         # Error boundary (must be 'use client')
  api/
    route.ts        # API route
  [id]/
    page.tsx        # /[id]
```

## Server Actions (forms without an API route)

```tsx
// lib/actions.ts
'use server';
import { revalidatePath } from 'next/cache';

export async function saveReport(formData: FormData) {
  const date = formData.get('date') as string;
  // Save to the DB...
  revalidatePath('/rapporter');
}

// Usage in a component
export function ReportForm() {
  return (
    <form action={saveReport}>
      <input name="date" type="date" required />
      <button type="submit">Save</button>
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
  date: z.string().min(1, 'Date is required'),
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
      <button type="submit" disabled={form.formState.isSubmitting}>Save</button>
    </form>
  );
}
```

## Tailwind — common patterns

```tsx
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Flexbox centering
<div className="flex items-center justify-between gap-2">

// Conditional classes (requires clsx or cn())
import { cn } from '@/lib/utils';
<div className={cn('base', isActive && 'bg-blue-500', className)}>

// Hover + transition
<button className="hover:bg-blue-600 transition-colors duration-200">
```

## Anti-patterns to avoid

```tsx
// Wrong: params without await (Next.js 15 — does not apply to Next.js 14)
// In Next.js 14 params are still synchronous

// Wrong: fetch in a Client Component when a Server Component works
'use client';
useEffect(() => { fetch('/api/data')... }, []); // Unnecessary

// Wrong: 'use client' on whole pages for no reason
// Keep pages as Server Components, extract the interactive parts

// Wrong: userId from query params instead of the session
// Always: const session = await getServerSession(authOptions)
```

## Working rules (every session, local or cloud)

- **Language:** everything written to a file is English: code comments, UI
  strings, API error messages, log output, README, JSON descriptions, commit
  messages. Chat with the owner in Swedish. No emojis unless asked.
- **UI language exception (this repo):** the product UI is Swedish (labels like
  "Lön", "Inställningar"). New UI text matches it; never translate existing UI.
  Code, comments, logs and API errors stay English.
- **`docs/` is local-only.** It is a scratch area between the owner and Claude,
  gitignored on purpose. Never commit it and never `git add -f` it. A cloud
  session will not see it; ask the owner to paste what you need.
- **No secrets in git:** `.env`, `.env.*`, dated backups like `.env.bak-*`,
  keys and tokens. Read `git status` before every commit.
- **Target platform:** the owner self-hosts on a Raspberry Pi (linux/arm64,
  Node 20) and an x86 Linux box, as Docker images behind Traefik. Code must
  build and run on linux/arm64 with Node 20. Check that any new native
  dependency ships arm64 builds.
- **Cloud sessions cannot reach production:** no host, no live database, no
  `.env`, no container logs. Deliver work as a branch and a PR whose
  description says how to verify it live. Deploy and live verification are
  done by the owner on the host. Do not claim something works in production.
- **Data safety:** never blanket-`DELETE` or `rm` a database or data directory
  to clean up after a test; remove only what the test created.
- **Keep diffs about the change:** do not reformat code you are not otherwise
  touching. Run `prettier --check` before `prettier --write` on an older file.
- **Archive, don't delete:** don't delete branches; tag them `archive/<name>`
  first.

## Lessons learned

### Pay math: one source per rule
- Build `PaySettings` only through `buildPaySettings()` (`lib/calculations/build-pay-settings.ts`). Why: `/lon`, `/statistik` and `/semester` each assembled their own settings once and drifted apart; it was a whole bug class.
- Resolve an hourly rate only through `resolveHourlyRate()` (`lib/calculations/contracts.ts`): dated history (latest `effectiveFrom <= date`, earliest row as floor), then flat rate, then contract table. Why: the calendar used the contract-table rate while `/lon` used the dated history.
- `app/api/calendar-data/route.ts` has its own per-entry pay calculation, separate from `lib/calculations/pay.ts`. Any change to rates, OB, sick or VAB pay must be made in both, or grep for other parallel calculations first.
- Per-day vacation pay goes through `getVacationDailyRate()` (`lib/vacation-rate.ts`); a manual `vacation_daily_rate` override beats the derived value. Why: the derived value (last year's pot / days per year) is wrong when the employer's earning year differs, and the consumers drifted before this existed.
- Only Mon-Fri consume a vacation day and earn vacation pay (`isPaidVacationDay` / `countPaidVacationDays` in `lib/calculations/vacation.ts`). A vacation period is still stored date by date, weekends included, so the calendar shows the whole absence. Weekday red days are not excluded (no evidence either way).
- In 'separate' vacation mode the vacation-pay percentage accrues to the pot and is not on the payslip. Compare payslips against `vacationPayPaid` (0 unless added to gross), not the accrued amount.

### Sick, VAB, OB rules not to regress
- The sick chain follows the return rule: a gap of <= 5 calendar days continues the period (no new waiting day); work and VAB days do not reset it. Logic lives in `lib/calculations/sick-chain.ts` (`SICK_RETURN_WINDOW_DAYS`).
- The waiting-day model is the old full karensdag, not the 2019 deduction model. Deliberate: it matches the employer's payslips.
- VAB pays 0 kr from the employer: it counts toward total hours but not `workHours`, and adds nothing to base/OB/overtime/sick pay.
- Retail OB: 100% after 12:00 on half-day holiday eves. When overtime beats OB for a day, that day's `obResult` is nulled so payslip rows still sum to gross.
- Absence entries (sick/VAB) may be a full day without start/end: start/end are `required={!isAbsence}` and the client sends `hours` directly. Keep that path when touching the time forms.

### Adding an entry type or field
- Drizzle's `text(..., { enum: [...] })` is TypeScript-only in SQLite (plain TEXT, no CHECK). A new `entry_type` value needs no migration.
- `components/dialogs/EditTimeEntryDialog.tsx` is a separate component from the add form; a new entry type or field must be added to both. VAB once existed only in "add new".
- Entry-type labels and badges are duplicated across `app/tid`, `app/rapporter`, `app/statistik` and `app/hjalp`; grep all of them.
- Calendar colours: sick = red, VAB = orange, red days = pink/rose. Entry-type colour takes precedence over the weekday tint (below `isToday`).

### Migrations and the database
- SQLite has no `ADD COLUMN IF NOT EXISTS`, and `next build` collects page data in several worker processes that open the same file. A `PRAGMA table_info` check is not atomic across them. Add runtime columns through `addColumnsIfMissing()` (`lib/db/add-columns.ts`), which treats `duplicate column name` as already applied. Why: a guarded ALTER failed the CI build once a second module imported `lib/db`.
- Do not add other I/O or queries at module top level in `lib/db` beyond what is already there. Route modules are imported by parallel build workers.
- Keep `scripts/migrate-vN.ts` self-contained: inline the SQL and import only `better-sqlite3`/`path`. Why: the runner image ships `scripts/` and `.next/standalone` but not `lib/`, so a migration importing from `lib/` works locally and fails where it is meant to run.
- Columns applied lazily from a route module (for example `lib/payslips/store.ts`) only appear after the first authenticated request that imports that module. Anything every request reads must be applied at `lib/db` init, as v19 is (`applyUserSettingsColumns`).

### Isolation and auth
- Every `/api/projects` verb filters on the session user, and time-entry POST/PUT verify project ownership. Answer 404, not 403, for another user's id. Why: projects once had no owner column and every user could edit everyone's projects.
- Do not re-add user pickers to `/lon` or `/rapporter`; admins must not see other users' pay. They were removed on purpose.
- `middleware.ts` excludes public assets by exact filename. Adding or renaming anything in `public/` (icons, manifest, sw) without updating the matcher makes it require a login. The login page's own favicon then silently redirects to `/login`.
- Icon URLs carry `?v=N` in `app/manifest.ts` and `app/layout.tsx`. Bump N whenever the icons change. Why: installed Android/iOS home-screen apps only pick up a new icon when the manifest itself changes.

### Tests
- `npm test` (vitest) locks the pay math with golden values taken from real payslips, and CI's image build `needs: test`. When a rule changes, add a regression test next to it in `lib/calculations/*.test.ts`. Do not loosen a golden value to make a test pass.
- Test files are excluded from the Next build via `tsconfig.json` (`**/*.test.ts`); keep new tests matching that pattern.
