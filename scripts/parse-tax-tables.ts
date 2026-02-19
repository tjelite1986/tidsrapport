import fs from 'fs';
import path from 'path';
import https from 'https';

const TAX_TABLE_URL_2026 = 'https://skatteverket.se/download/18.1522bf3f19aea8075ba5af/1765287119989/allmanna-tabeller-manad.txt';
const TAX_TABLE_URL_2025 = 'https://skatteverket.se/download/18.262c54c219391f2e9632603/allmanna-tabeller-manad.txt';
const MUNICIPALITY_URL_2026 = 'https://skatteverket.se/download/18.1522bf3f19aea8075ba428/1765291540367/skattesatser-kommuner-2026.txt';
const MUNICIPALITY_URL_2025 = 'https://skatteverket.se/download/18.262c54c219391f2e96326e2/skattesatser-kommuner-2025.txt';

const OUTPUT_DIR = path.join(__dirname, '..', 'lib', 'tax-tables');

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

function download(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseTaxTables(content: string): Record<number, TableData> {
  const tables: Record<number, TableData> = {};
  const lines = content.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    // Fixed-width format:
    // 0-4: prefix (30B29 or 30%42)
    // 5-11: from (7 chars)
    // 12-18: to (7 chars)
    // 19+: 6 columns of tax values (5 chars each)
    const prefix = line.substring(0, 5);
    const isFixed = prefix.startsWith('30B');
    const isPercent = prefix.startsWith('30%');
    if (!isFixed && !isPercent) continue;

    const tableStr = prefix.substring(3);
    const tableNr = parseInt(tableStr);
    if (isNaN(tableNr) || tableNr < 29 || tableNr > 42) continue;

    if (!tables[tableNr]) {
      tables[tableNr] = { brackets: [], percentBrackets: [] };
    }

    const fromStr = line.substring(5, 12).trim();
    const toStr = line.substring(12, 19).trim();
    const from = parseInt(fromStr) || 0;
    const to = toStr ? parseInt(toStr) : null;

    // Column 1 is the first value after position 18 (normal tax, under 66, with jobbskatteavdrag)
    const valuesStr = line.substring(19).trim();
    const values = valuesStr.split(/\s+/).map(Number);
    const col1 = values[0];

    if (isFixed) {
      tables[tableNr].brackets.push({ from, to, tax: col1 });
    } else {
      tables[tableNr].percentBrackets.push({ from, to, rate: col1 });
    }
  }

  return tables;
}

interface MunicipalityEntry {
  name: string;
  totalTaxRate: number;
  tableNumber: number;
}

function taxRateToTable(rate: number): number {
  const rounded = Math.round(rate);
  return Math.max(29, Math.min(42, rounded));
}

function parseMunicipalities(content: string): Record<string, MunicipalityEntry> {
  // First pass: collect exkl-rate and minimum inkl-rate per municipality.
  // Skatteverket issues A-skattekort with the TOTAL rate (inkl kyrkoavgift) for church members,
  // which is what employers (e.g. Biltema) read when determining the tax table.
  // Using the minimum total-inkl rate per municipality matches the table that most employees see
  // on their payslips. Non-church-members can manually override the table in settings.
  const temp: Record<string, { name: string; exklRate: number; minInklRate: number }> = {};
  const lines = content.split('\n');

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length < 6) continue;

    const kommunName = parts[2].trim();
    const sumInklKyrko = parseFloat(parts[4].replace(',', '.'));
    const sumExklKyrko = parseFloat(parts[5].replace(',', '.'));

    if (isNaN(sumExklKyrko) || isNaN(sumInklKyrko)) continue;

    const key = kommunName;
    if (!temp[key]) {
      temp[key] = { name: kommunName, exklRate: sumExklKyrko, minInklRate: sumInklKyrko };
    } else {
      // Track minimum total (inkl kyrkoavg) — represents lowest church-member rate in this municipality
      if (sumInklKyrko < temp[key].minInklRate) {
        temp[key].minInklRate = sumInklKyrko;
      }
    }
  }

  const municipalities: Record<string, MunicipalityEntry> = {};
  for (const [key, data] of Object.entries(temp)) {
    municipalities[key] = {
      name: data.name,
      totalTaxRate: data.exklRate,
      tableNumber: taxRateToTable(data.minInklRate),
    };
  }

  return municipalities;
}

async function processYear(year: number, taxUrl: string, munUrl: string) {
  console.log(`\n=== Processing ${year} ===`);

  console.log('Downloading tax tables...');
  const taxContent = await download(taxUrl);
  console.log(`Downloaded ${taxContent.length} bytes`);

  const tables = parseTaxTables(taxContent);
  const tableNumbers = Object.keys(tables).map(Number).sort((a, b) => a - b);
  console.log(`Parsed tables: ${tableNumbers.join(', ')}`);

  const taxOutputPath = path.join(OUTPUT_DIR, `data-${year}.json`);
  fs.writeFileSync(taxOutputPath, JSON.stringify(tables));
  console.log(`Saved to ${taxOutputPath} (${(fs.statSync(taxOutputPath).size / 1024).toFixed(1)} KB)`);

  console.log('Downloading municipality data...');
  const munContent = await download(munUrl);
  console.log(`Downloaded ${munContent.length} bytes`);

  const municipalities = parseMunicipalities(munContent);
  console.log(`Parsed ${Object.keys(municipalities).length} unique municipalities`);

  // Verify a few known municipalities
  const check = ['VÄNERSBORG', 'TROLLHÄTTAN', 'STOCKHOLM'];
  for (const name of check) {
    const m = municipalities[name];
    if (m) console.log(`  ${name}: ${m.totalTaxRate}% exkl kyrkoavg → tabell ${m.tableNumber}`);
  }

  const munOutputPath = path.join(OUTPUT_DIR, `municipalities-${year}.json`);
  fs.writeFileSync(munOutputPath, JSON.stringify(municipalities));
  console.log(`Saved to ${munOutputPath} (${(fs.statSync(munOutputPath).size / 1024).toFixed(1)} KB)`);
}

async function main() {
  await processYear(2025, TAX_TABLE_URL_2025, MUNICIPALITY_URL_2025);
  await processYear(2026, TAX_TABLE_URL_2026, MUNICIPALITY_URL_2026);
  console.log('\nDone!');
}

main().catch(console.error);
