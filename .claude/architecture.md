# Tidsrapport – Arkitektur

## Sidor (app/)
| Rutt | Fil | Beskrivning |
|------|-----|-------------|
| `/` | app/page.tsx | Dashboard – senaste poster, summering |
| `/tid` | app/tid/page.tsx | Tidsregistrering + månadskalender (standard) |
| `/timer` | app/timer/page.tsx | Löpande tidtagning |
| `/projekt` | app/projekt/page.tsx | Projekthantering |
| `/rapporter` | app/rapporter/page.tsx | CSV-export |
| `/lon` | app/lon/page.tsx | Löneöversikt (väljer utbetalningsmånad → visar föregående månads arbete) |
| `/lonespecar` | app/lonespecar/page.tsx | Arkiv för arbetsgivarens lönespecar + rad-för-rad-jämförelse mot beräknad lön (formulär: components/salary/PayslipFieldsEditor.tsx) |
| `/statistik` | app/statistik/page.tsx | Diagram och statistik |
| `/installningar` | app/installningar/page.tsx | Användarinställningar |
| `/admin` | app/admin/page.tsx | Användarhantering (admin only) |
| `/hjalp` | app/hjalp/page.tsx | Hjälpsida (ingen auth) |

## API Routes (app/api/)
| Route | Metoder | Beskrivning |
|-------|---------|-------------|
| `/api/time-entries` | GET, POST, PUT, DELETE | CRUD tidsregistreringar |
| `/api/projects` | GET, POST, PUT, DELETE | CRUD projekt |
| `/api/salary` | GET | Löneberäkning per månad (taxYear från arbetsmånad) |
| `/api/salary/payslip` | GET | Underlaget till det genererade lönebeskedet för en utbetalningsmånad |
| `/api/payslips` | GET, POST, PUT, DELETE | Uppladdade lönespecar: lista m. jämförelse, uppladdning (multipart), belopp/anteckning, radering |
| `/api/payslips/[id]/file` | GET | Filen (inline, `?download=1` för nedladdning) — 404 för andras id:n |
| `/api/payslips/extract` | POST | AI-avläsning av en uppladdad fil (sparar inget) → `{payMonth, obLines[], + alla fält i PAYSLIP_FIELDS}` |
| `/api/stats` | GET | Statistik inkl. weekdayHours/Avg/Count |
| `/api/settings` | GET, PUT | Användarinställningar |
| `/api/calendar-data` | GET | Tidsregistreringar + löneberäkning per dag |
| `/api/vacation-pay` | GET, POST | Semesterersättning per intjänandeår + uttag |
| `/api/vacation-pay-inclusion` | GET, POST | Toggle semesterersättning i månadslön |
| `/api/municipalities` | GET | Kommunlista med skattetabellnummer |
| `/api/templates` | GET, POST, PUT, DELETE | Arbetsmallar |
| `/api/schedule` | GET, POST, PUT, DELETE | Veckoschema A/B/C/D |
| `/api/holidays` | GET | Svenska helgdagar |
| `/api/reports` | GET | CSV-export |
| `/api/users` | GET, POST, DELETE | Admin: användarhantering |
| `/api/auth/[...nextauth]` | – | NextAuth |

## Lönespecar (lib/payslips/)
- `files.ts` — `detectPayslipType()` (magic bytes), `isValidPayMonth()`, `workMonthFor()`, `sanitizeOriginalName()`, `buildStoredName()`/`isSafeStoredName()`, `parseAmount()` (svenskt format)
- `store.ts` — DB + disk: `listPayslips`, `getPayslip` (ägarscopad), `createPayslip` (fil först, rad sedan), `updatePayslipFields`, `deletePayslip` (rad först, fil sedan). Skapar tabellen vid import.
- `table.ts` — DDL (delad med `scripts/migrate-v17.ts`) + `PAYSLIP_EXTRA_COLUMNS` (v18-kolumnerna, delade med `scripts/migrate-v18.ts`)
- `fields.ts` — `PAYSLIP_FIELDS` (alla lönerader m. etikett/enhet/grupp), `parseObLines()`/`readObLines()`/`serializeObLines()`, `buildComparison()` (rad-för-rad-jämförelse, OB uppdelat per procentsats)
- `extract.ts` — AI-avläsning via OpenRouter (först) eller Anthropic; JSON-schema med nullbara fält för samtliga lönerader
- Filer: `data/payslips/<userId>/YYYY-MM-<uuid>.<ext>` (max 10 MB, PDF/PNG/JPG/WEBP)

## Löneberäkning (lib/salary/)
- `monthly.ts` — `computeMonthlySalary(userId, month)`, delad av `/api/salary` och `/api/payslips`
- `payslip-document.ts` — `buildPayslipDocument(userId, payMonth)`: rader, header, semestersaldon, ackumulerat per år, sociala avgifter

## Genererat lönebesked (lib/pdf/)
- `payslip-lines.ts` — `buildPayslipLines()`: en rad per artikelnummer (Art/Text/Antal/A-pris/Belopp). Beloppen summerar till utbetalt belopp — därav `996 Öresutjämning`
- `payslip-generator.ts` — `generatePayslipPDF()`: ritar A4-lönebeskedet med jsPDF (header, tabell, meddelande, sammanställningsruta)

## Beräkningar (lib/calculations/)
- `pay.ts` — bruttolön, OB, övertid, sjuklön, semesterersättning; `overtimeHours`/`sickHours` ger timmarna bakom beloppen
  - PaySettings: salaryMode (contract/hourly/fixed_plus), fixedMonthlySalary, workingHoursPerMonth
- `ob.ts` — OB-tillägg (butik/lager), rast fördelas till längsta segmentet
- `time-utils.ts` — getWeekType(), formatDate() (lokala datumkomponenter!)
- `holidays.ts` — svenska helgdagar
- `contracts.ts` — avtalsnivåer (Handels)

## DB-schema (userSettings viktiga fält)
```
salary_mode          TEXT    -- contract | hourly | fixed_plus
custom_hourly_rate   REAL
fixed_monthly_salary REAL
tax_mode             TEXT    -- percentage | table
tax_table            INTEGER -- 29-42
municipality         TEXT
schedule_reference_date TEXT
schedule_week_count  INTEGER -- 2 | 4
```

## DB-schema (payslips)
```
pay_month      TEXT   -- YYYY-MM, utbetalningsmånad enligt specen
original_name  TEXT   -- användarens filnamn, endast för visning
stored_name    TEXT   -- appens namn på disk
mime_type      TEXT
size_bytes     INTEGER
gross_pay/tax/net_pay REAL  -- NULL = ej ifyllt
work_hours     REAL   -- v18: lönerader från specen, alla NULL = ej ifyllt
hourly_rate    REAL
base_pay       REAL
ob_lines       TEXT   -- JSON [{percent, hours, amount}] — läs via readObLines()
total_ob       REAL
overtime_mertid/overtime_enkel/overtime_kvalificerad REAL
sick_pay       REAL
vacation_pay   REAL
vacation_days_pay/vacation_days_count REAL
note           TEXT
```

## Komponenter
- `components/DatePicker.tsx` — måndag-first kalender
- `components/TimePicker.tsx` — analog urtavla, 24h
- `components/Navigation.tsx` — navItems-array (lägg till nya sidor här)
- `components/charts/` — BarChart, PieChart, LineChart, StackedBarChart, DonutChart (SVG)
- `components/dialogs/` — TimeEntryDetailsDialog, EditTimeEntryDialog
- `components/calendar/` — CalendarWeekView, CalendarMonthView, CalendarViewToggle
- `components/salary/` — TotalSummaryCard, VacationPayTracker

## Skattetabell
- Data: `lib/tax-tables/data-2025.json`, `data-2026.json` (323 KB/st — läs INTE direkt)
- API: `lib/tax-tables/tax-lookup.ts` — `lookupMonthlyTax(gross, table, year)`
- Kommuner: `municipalities-2025.json`, `municipalities-2026.json`
