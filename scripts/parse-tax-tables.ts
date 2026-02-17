import fs from 'fs';
import path from 'path';
import https from 'https';

const TAX_TABLE_URL = 'https://skatteverket.se/download/18.1522bf3f19aea8075ba5af/1765287119989/allmanna-tabeller-manad.txt';
const MUNICIPALITY_URL = 'https://skatteverket.se/download/18.1522bf3f19aea8075ba428/1765291540367/skattesatser-kommuner-2026.txt';

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
  // Skatteverket table numbers correspond to total municipal tax rate (exkl. kyrkoavgift)
  // rounded down to nearest integer: table 29 = 29%, table 30 = 30%, etc.
  const rounded = Math.round(rate);
  return Math.max(29, Math.min(42, rounded));
}

function parseMunicipalities(content: string): Record<string, MunicipalityEntry> {
  const municipalities: Record<string, MunicipalityEntry> = {};
  const lines = content.split('\n');

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('\t');
    if (parts.length < 6) continue;

    const kommunName = parts[2].trim();
    const sumExklKyrko = parseFloat(parts[5].replace(',', '.'));

    if (isNaN(sumExklKyrko)) continue;

    // Use kommun name as key (uppercase), only store first entry per kommun
    const key = kommunName;
    if (!municipalities[key]) {
      municipalities[key] = {
        name: kommunName,
        totalTaxRate: sumExklKyrko,
        tableNumber: taxRateToTable(sumExklKyrko),
      };
    }
  }

  return municipalities;
}

async function main() {
  console.log('Downloading tax tables from Skatteverket...');
  const taxContent = await download(TAX_TABLE_URL);
  console.log(`Downloaded ${taxContent.length} bytes of tax table data`);

  console.log('Parsing tax tables...');
  const tables = parseTaxTables(taxContent);
  const tableNumbers = Object.keys(tables).map(Number).sort((a, b) => a - b);
  console.log(`Parsed tables: ${tableNumbers.join(', ')}`);
  for (const nr of tableNumbers) {
    console.log(`  Table ${nr}: ${tables[nr].brackets.length} brackets, ${tables[nr].percentBrackets.length} percent brackets`);
  }

  const taxOutputPath = path.join(OUTPUT_DIR, 'data-2026.json');
  fs.writeFileSync(taxOutputPath, JSON.stringify(tables));
  console.log(`Saved tax tables to ${taxOutputPath} (${(fs.statSync(taxOutputPath).size / 1024).toFixed(1)} KB)`);

  console.log('\nDownloading municipality data...');
  const munContent = await download(MUNICIPALITY_URL);
  console.log(`Downloaded ${munContent.length} bytes of municipality data`);

  console.log('Parsing municipalities...');
  const municipalities = parseMunicipalities(munContent);
  const munCount = Object.keys(municipalities).length;
  console.log(`Parsed ${munCount} unique municipalities`);

  const munOutputPath = path.join(OUTPUT_DIR, 'municipalities-2026.json');
  fs.writeFileSync(munOutputPath, JSON.stringify(municipalities));
  console.log(`Saved municipalities to ${munOutputPath} (${(fs.statSync(munOutputPath).size / 1024).toFixed(1)} KB)`);

  console.log('\nDone!');
}

main().catch(console.error);
