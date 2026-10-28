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
v2 → … → v14 (per-user projects) → v15 (hourly_rate_history) → v16 (vacation_daily_rate) → v17 (payslips) → v18 (salary lines on payslips) → v19 (payslip document fields on user_settings) → v20 (sick/karens hours on payslips) → v21 (messages) → v22 (calendar_events) → v23 (recurring calendar events) → v24 (own copy of shared projects + default project per user) → v25 (`schedule_ics_url` on user_settings; also applied at `lib/db` init) → v26 (schedule sync columns + `schedule_sync_items`; applied at init / on import of `lib/schedule-sync/store.ts`) → v27 (`notifications` + `seen_*`/`first_*`/`gone` on `schedule_sync_items`; applied on import of `lib/notifications/store.ts` and `lib/schedule-sync/store.ts`) → v28 (`ref` on `notifications` + partial unique index; applied on import of `lib/notifications/store.ts`) → v29 (`vacation_daily_rates` per user and vacation year; the old `user_settings.vacation_daily_rate` is moved to 2026 and cleared; applied on import of `lib/vacation-rate.ts`) → v30 (`time_entries.hourly_rate_override`, the per-shift rate; applied at `lib/db` init by `applyTimeEntryColumns`, latest)
Next: **v31**. Run inside the container: `docker exec tidsrapport npx tsx scripts/migrate-vN.ts /app/data/tidsrapport.db`
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
cd <compose dir for tidsrapport on the host> && docker compose pull && docker compose up -d
docker logs tidsrapport --tail 20
```

## CI/CD flow (Apr 2026)
1. `git push origin master` → GitHub Actions builds a multi-arch image (arm64 + amd64)
2. The image is pushed to `ghcr.io/tjelite1986/tidsrapport:latest` (public package)
3. Watchtower on the Pi checks hourly → pulls the new image → restarts the container
- The compose file uses `image: ghcr.io/tjelite1986/tidsrapport:latest`, NOT a local `build:`
- Watchtower runs as its own compose stack on the host
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

## Schedule import (screenshot → time entries)
- `/tid` → "Importera schema" posts a PNG/JPG/WEBP to `/api/schedule-import`. The month is **not** chosen by the user: the model only transcribes the grid (`lib/schedule-import/extract.ts`: week number per row, per cell column 0–6, day number, greyed flag, start/end), and `resolveSchedule()` in `lib/schedule-import/resolve.ts` dates it — ISO week + column + day number pins the month exactly. Without week numbers it falls back on the day pattern over a window around today, ties go to a visible month heading, then to the month nearest next month
- The route saves nothing. It answers `{month, shifts[{date,startTime,endTime,existing}], outsideMonth}`; dates that already have a time entry come back `existing: true` and the dialog leaves them unchecked, so a re-upload does not double the month. Shifts on greyed neighbouring-month days are counted in `outsideMonth` and not imported
- AI calls go through `lib/ai/vision-json.ts` (OpenRouter first, same env variables as the payslip reader). `resolve.test.ts` locks the two sample screenshots; `scripts/try-schedule-import.ts <image>` runs the live path from the host without saving
- The same dialog has a "Kalenderlänk" tab: an .ics link (ipool publishes one per employee) is fetched server-side by `/api/schedule-import/ics` and parsed by `parseIcsSchedule()` (`lib/schedule-import/ics.ts`, tested). UTC times are converted to Europe/Stockholm; events whose SUMMARY is in parentheses — `(Sjuk)`, `(Semester)` — are absence markers, counted in `skipped` and never imported. Same `existing` rule as the screenshot path. The last link is remembered in `user_settings.schedule_ics_url` and prefilled next time
- `lib/schedule-import/fetch-ics.ts` is a server-side fetch of a user-supplied URL: https/webcal only, every hop (redirects followed manually) must resolve to a public address, 2 MB cap, 15 s timeout. The address check runs inside the `lookup` passed to `https.request`, so the checked IP is the one connected to (no DNS rebinding); IPv4 and IPv6 ranges live in two `BlockList`s because one list would let `::ffff:0:0/96` block every IPv4 host. Keep those checks — without them any account can make the server read the LAN
- Departments: ipool's SUMMARY is `<workplace> - <dept>, <dept>`; `departmentsOf()` reads the list and it is written to the entry's `description`. The feed has no per-department times, so no `taskSegments` are made from it
- Automatic sync (v26): the "Synka automatiskt" box in the link tab sets `schedule_sync_enabled` + `schedule_sync_project_id` (`PUT /api/schedule-import/ics/sync`, which also syncs at once). `instrumentation.ts` (needs `experimental.instrumentationHook`) starts `lib/schedule-sync/scheduler.ts`: first pass after 60 s, then every 30 min, in-process. The rules live in `planSync()` (`lib/schedule-sync/plan.ts`, tested): create only from today on, and only on dates where every entry is a synced one and none overlaps the new shift (a split day gets one entry per shift; a date with a user-made entry is left alone); follow moved/changed shifts and remove vanished ones only while the entry is exactly as the sync wrote it (tracked per feed UID in `schedule_sync_items`); never touch past dates; never recreate an entry the user deleted; an empty feed removes nothing. ipool never edits a shift in place: a changed shift leaves under its old UID and returns under a new one, so `pairReplacedShifts()` pairs the one item that left a date (from today on, not yet `gone`) with the one unknown shift that arrived on it, and the store renames the item to the new UID before planning — otherwise every schedule change read as removed + new and nothing followed. A work entry the user made by hand (screenshot import, typed in) with exactly the item's last times is adopted when the shift's times or date change: it is updated and gets the item's `entry_id`; an unchanged shift never adopts, and sick/VAB entries never are. Synced entries get the auto-break rules plus a mid-shift `break_periods` (`generateBreakPeriod`, as the time form does; without it the break shows no times and OB splits it proportionally), unlike the manual import which sends 0

## Notifications (bell)
- `/notiser` + `/api/notifications` (`GET`, `GET ?unread=1`, `POST {action:'read'}`, `DELETE ?id=`), table `notifications` (v27, created by `lib/notifications/store.ts` on import). The bell sits next to the messages icon on mobile and in the nav list on desktop; the badge polls every 60 s and refreshes on the `notifications-read` event. Opening the page marks everything read
- Schedule notices come from `planNotices()` (`lib/schedule-sync/notices.ts`, tested), run on every sync pass. The comparison is against what the **feed** said on the previous pass (`seen_*` on `schedule_sync_items`), not against the entry, so each change by the employer is reported once whether or not the sync could apply it — the notice says which (applied / the user edited the entry / the date has passed). `first_*` holds the shift as first seen and is shown as "Ursprungligt schema" once it differs; rows from before v27 take it from the values the sync last wrote, at their first change
- New shifts from today on are gathered into one notice per pass; the first sync for a user reports none. A future shift leaving the feed is reported once (`gone = 1`); past shifts leaving the feed and an empty feed report nothing. An item with `seen_date` NULL is only recorded, so deploying v27 did not flood the bell
- App updates: `APP_UPDATES` in `lib/notifications/changelog.ts` (newest first, Swedish). `GET /api/notifications` calls `deliverAppUpdates()`, which `INSERT OR IGNORE`s every entry dated on or after the user's `created_at` day as kind `app_update` with `ref = id` (unique per user, v28) — so a deploy with a new entry lights every bell within a minute, and a new account gets no backlog. Never change or reuse an `id`; a feature worth announcing gets an entry in the same commit
- The user-deletion cascade in `/api/users` calls `deleteNotificationsForUser()`

## Generated payslip document (PDF)
- `/lon` → "Exportera lönebesked" fetches `/api/salary/payslip?month=<payout month>` and draws the PDF client-side. The month is the **payout month**; the rows cover the work period of the month before (`workMonthFor`)
- The source data is built server-side in `lib/salary/payslip-document.ts` — header, holiday balances, accumulated columns and employer contributions. The accumulated columns recompute every earlier payout month in the same year (at most twelve `computeMonthlySalary` calls)
- The rows are built by `buildPayslipLines()` in `lib/pdf/payslip-lines.ts` (pure function, tested in `payslip-lines.test.ts`). **The amount column sums exactly to the paid-out amount** — that is why the row `996 Öresutjämning` exists. New entries go there, not in the generator
- Overtime hours are split out of the `10 Timlön` row and get a row of their own with the full hourly cost as unit price, otherwise quantity × unit price does not match the amount
- Holiday compensation that goes into the reserve does **not** appear among the rows — it is not paid out that month
- `lib/pdf/payslip-generator.ts` only draws. jsPDF's WinAnsi fonts lack U+00A0 and U+2212, so `fmt()` swaps them for ASCII — otherwise thousands separators and minus signs turn into boxes
- Header and footer data (employee number, addresses, org. number, bank account, payout day, employer contribution, message) are v19 columns on `user_settings` and are edited under Inställningar → "Uppgifter på lönebeskedet". None of it affects the salary calculation
- Columns the app has no source for (saved/advance/unpaid holiday days, comp-time balance, benefits) are written **empty**, never as 0

## Messages between users
- `/meddelanden` + `/api/messages`: one-to-one messages between any two users. The `messages` table (v21) is created by `lib/messages/store.ts` on import, so `scripts/migrate-v21.ts` is optional
- Only sender and recipient can read a conversation — there is no admin view. `GET ?with=<id>` marks the other user's messages as read; the nav badge polls `GET ?unread=1` every 60 s and refreshes on the `messages-read` window event
- `messages` has FKs to `users`: the user-deletion cascade in `/api/users` calls `deleteMessagesForUser()` before the users row goes

## Calendar events
- `/tid` → "+ Händelse" adds a personal appointment (title, date, optional start/end time or all-day, note) to the calendar. Clicking an event chip in the week or month view opens it for edit/delete
- `calendar_events` (v22) is created by `lib/calendar-events/store.ts` on import, so `scripts/migrate-v22.ts` is optional. Events are per user (404 for someone else's id) and never feed the pay calculation
- The user-deletion cascade in `/api/users` calls `deleteEventsForUser()` before the users row goes
- Recurring events (v23 columns, added at import via `addColumnsIfMissing`): `recurrence` none/daily/weekly/biweekly/monthly, optional `recurrence_until`, and `excluded_dates` (JSON) for single occurrences removed with `DELETE ?id=&occurrence=<date>`. One row per series; `listEvents()` expands it with `occurrencesInRange()` (`lib/calendar-events/recurrence.ts`, tested). Editing always edits the whole series; `date` is the first occurrence and the API returns it as `seriesDate`. Monthly on the 29th-31st skips months that lack the day

## UI conventions (redesign 2026-10-23)
- Colours mean the same thing everywhere (`components/ui/tones.ts`): blue = time and actions, emerald = money earned, red = deductions/sick, orange = OB and VAB, amber = overtime, teal = vacation. Tiles are white; only the value carries the colour. Do not add per-tile pastel colours back
- Page titles go through `components/ui/PageHeader.tsx`; the home greeting card is the only hero
- Mobile (below `2xl`) has a bottom tab bar (Hem, Tid, Lön, Lönespecar, Mer) in `components/Navigation.tsx`; help, settings, bell and messages stay in the header. Anything fixed to the bottom must sit above it (`bottom-[calc(...+env(safe-area-inset-bottom))]`) and `<main>` keeps `pb-28`
- Charts return `EmptyChart` when every value is 0; `BarChart`/`StackedBarChart` are flex columns so they fit a phone without scrolling
- Motion (2026-10-28) lives in `app/globals.css`: `animate-rise`/`grow-y`/`grow-x`/`draw`/`fade`/`drift`/`shimmer`, all off under `prefers-reduced-motion`. `<main>` has `page-stagger`, which makes every page's top-level sections rise in one after another (`.fixed` children are skipped so dialogs open without delay). `StatTile` counts up any string value that starts with its number (`CountUpText`); round charts sweep in through `SweepMask`
- Rollback to the old look: git tag `ui-before-redesign-2026-10-23`; the old image is tagged locally on the Pi as `ghcr.io/tjelite1986/tidsrapport:ui-before-redesign`

## Warnings
- `lib/tax-tables/data-*.json` are 323 KB each — do NOT read these files, use `lib/tax-tables/tax-lookup.ts`
- `node_modules/`, `.next/` — never read

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
- A per-shift rate (`time_entries.hourly_rate_override`, v30) beats all of those, in every salary mode, and feeds base pay, OB, overtime and sick pay for that entry; in `fixed_plus` the base pay stays the fixed salary. It is applied in `pay.ts` and in `calendar-data`, and every `TimeEntryForPay` mapping (`lib/salary/monthly.ts`, `/api/stats`, `/api/vacation-pay`, `lib/vacation-rate.ts`) must carry `hourlyRateOverride`, or that page pays the shift at the normal rate. Values go through `parseRateOverride()`. The schedule sync's UPDATE does not touch the column, so a moved shift keeps its rate.
- `app/api/calendar-data/route.ts` has its own per-entry pay calculation, separate from `lib/calculations/pay.ts`. Any change to rates, OB, sick or VAB pay must be made in both, or grep for other parallel calculations first.
- Per-day vacation pay goes through `getVacationDailyRate()` (`lib/vacation-rate.ts`); a manual rate for that vacation year (`vacation_daily_rates`, v29) beats the derived value. Why: the derived value (last year's pot / days per year) is wrong when the employer's earning year differs, and the consumers drifted before this existed. The manual rate is per year because a payslip's A-pris only holds for the year it was printed in; one global rate silently priced 2027's days with 2026's rate.
- The vacation-pay pot (`app/api/vacation-pay/route.ts`) is kept per earning year: earned in X, paid out by weekday vacation days taken in X+1 (priced through `getVacationDailyRate`), manual withdrawals taken from the oldest pot first. Only entries dated today or earlier earn into it — scheduled future shifts are already in `time_entries`.
- A work month with an uploaded payslip (gross filled in) earns into the pot from the payslip, not from time entries: base = gross − `vacationPay` − `vacationDaysPay` (`payslipVacationBase`, `lib/payslips/vacation-base.ts`), times the user's vacation-pay rate; the newest upload per payout month wins. Why: entries ran 866 kr above Biltema's payslips for 2025, almost all in the summer months. Months without a payslip still come from entries. The per-day rate is NOT derived from the pot: no base/percentage/day-count combination reproduced Biltema's 1 333,81, so the manual rate per year is the reference.
- A work entry on a vacation day is paid twice by the calculation (hours + vacation day) while the employer pays one. `/api/time-entries/vacation-conflicts` lists them and `/tid` shows a banner; `planSync` treats a vacation date like a date with a user entry (no create, no move onto it). Why: four scheduled shifts left on June 2026 vacation days put that month 19 h over the payslip.
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
- Every user owns their own projects; new users get a default "Arbete" project at creation (`createDefaultProject()`, called from register and admin create). Why: users created after v14 had an empty project picker and could not log time.
- Do not re-add user pickers to `/lon` or `/rapporter`; admins must not see other users' pay. They were removed on purpose.
- `middleware.ts` excludes public assets by exact filename. Adding or renaming anything in `public/` (icons, manifest, sw) without updating the matcher makes it require a login. The login page's own favicon then silently redirects to `/login`.
- Icon URLs carry `?v=N` in `app/manifest.ts` and `app/layout.tsx`. Bump N whenever the icons change. Why: installed Android/iOS home-screen apps only pick up a new icon when the manifest itself changes.

### Tests
- `npm test` (vitest) locks the pay math with golden values taken from real payslips, and CI's image build `needs: test`. When a rule changes, add a regression test next to it in `lib/calculations/*.test.ts`. Do not loosen a golden value to make a test pass.
- Test files are excluded from the Next build via `tsconfig.json` (`**/*.test.ts`); keep new tests matching that pattern.
