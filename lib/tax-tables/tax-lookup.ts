import taxData2025 from './data-2025.json';
import taxData2026 from './data-2026.json';
import municipalityData from './municipalities-2026.json';

interface TaxBracket {
  from: number;
  to: number | null;
  tax: number;
}

interface PercentBracket {
  from: number;
  to: number | null;
  rate: number;
}

interface TableData {
  brackets: TaxBracket[];
  percentBrackets: PercentBracket[];
}

const tablesByYear: Record<number, Record<string, TableData>> = {
  2025: taxData2025 as Record<string, TableData>,
  2026: taxData2026 as Record<string, TableData>,
};

const municipalities = municipalityData as Record<string, { name: string; totalTaxRate: number; tableNumber: number }>;

function getTablesForYear(year: number): Record<string, TableData> {
  return tablesByYear[year] || tablesByYear[2026];
}

/**
 * Look up monthly tax from Skatteverket's tax tables.
 * Uses column 1 (normal employment income, under 66, with jobbskatteavdrag).
 * Year determines which year's tax tables to use.
 */
export function lookupMonthlyTax(grossMonthly: number, tableNumber: number, year?: number): number {
  const tables = getTablesForYear(year || new Date().getFullYear());
  const table = tables[String(tableNumber)];
  if (!table) return 0;

  const rounded = Math.round(grossMonthly);

  // First check fixed brackets (income up to ~80 000 kr/month)
  for (const bracket of table.brackets) {
    const to = bracket.to ?? Infinity;
    if (rounded >= bracket.from && rounded <= to) {
      return bracket.tax;
    }
  }

  // Then check percent brackets (income over ~80 000 kr/month)
  for (const bracket of table.percentBrackets) {
    const to = bracket.to ?? Infinity;
    if (rounded >= bracket.from && rounded <= to) {
      return Math.round(rounded * bracket.rate / 100);
    }
  }

  return 0;
}

/**
 * Get table number from municipal tax rate (rounded to nearest integer, clamped 29-42).
 */
export function getTableNumber(municipalTaxRate: number): number {
  const rounded = Math.round(municipalTaxRate);
  return Math.max(29, Math.min(42, rounded));
}

/**
 * Get municipality info by name.
 */
export function getMunicipalityTable(municipalityName: string): number | null {
  const entry = municipalities[municipalityName] || municipalities[municipalityName.toUpperCase()];
  return entry ? entry.tableNumber : null;
}

function titleCase(str: string): string {
  return str.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/**
 * Get list of all municipalities for dropdown.
 */
export function getMunicipalityList(): { name: string; taxRate: number; tableNumber: number }[] {
  return Object.values(municipalities)
    .map((m) => ({ name: titleCase(m.name), taxRate: m.totalTaxRate, tableNumber: m.tableNumber }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

/**
 * Get available table numbers.
 */
export function getAvailableTableNumbers(): number[] {
  return Object.keys(tablesByYear[2026]).map(Number).sort((a, b) => a - b);
}
