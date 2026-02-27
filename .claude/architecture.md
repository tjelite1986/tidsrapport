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

## Beräkningar (lib/calculations/)
- `pay.ts` — bruttolön, OB, övertid, sjuklön, semesterersättning
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
