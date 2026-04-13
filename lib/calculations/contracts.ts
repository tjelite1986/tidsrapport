export type ContractLevel =
  | '16ar'
  | '17ar'
  | '18ar'
  | '19ar'
  | '1ar_erf'
  | '2ar'
  | '3plus';

type RateTable = Record<ContractLevel, number>;

interface RateEntry {
  effectiveFrom: string; // YYYY-MM-DD
  rates: RateTable;
}

const rateHistory: RateEntry[] = [
  {
    effectiveFrom: '2000-01-01',
    rates: {
      '16ar': 101.48,
      '17ar': 103.95,
      '18ar': 155.51,
      '19ar': 157.44,
      '1ar_erf': 160.95,
      '2ar': 162.98,
      '3plus': 165.84,
    },
  },
  {
    effectiveFrom: '2026-04-01',
    rates: {
      '16ar': 106.37,
      '17ar': 108.84,
      '18ar': 160.40,
      '19ar': 162.33,
      '1ar_erf': 165.84,
      '2ar': 167.87,
      '3plus': 170.73,
    },
  },
];

// Aktuella (senaste) taxor — används för UI-visning och fallback
const currentRates = rateHistory[rateHistory.length - 1].rates;

export const contractLevels: Record<ContractLevel, { label: string; hourlyRate: number }> = {
  '16ar': { label: '16 år', hourlyRate: currentRates['16ar'] },
  '17ar': { label: '17 år', hourlyRate: currentRates['17ar'] },
  '18ar': { label: '18 år', hourlyRate: currentRates['18ar'] },
  '19ar': { label: '19 år', hourlyRate: currentRates['19ar'] },
  '1ar_erf': { label: '1 års erfarenhet', hourlyRate: currentRates['1ar_erf'] },
  '2ar': { label: '2 års erfarenhet', hourlyRate: currentRates['2ar'] },
  '3plus': { label: '3+ års erfarenhet', hourlyRate: currentRates['3plus'] },
};

// Returnerar timlönen för given nivå och datum — hanterar löneökningar automatiskt
export function getHourlyRateForDate(level: string, date: string): number {
  const applicable = rateHistory
    .filter((r) => r.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const table = applicable?.rates ?? currentRates;
  return table[level as ContractLevel] ?? table['3plus'];
}

// Bakåtkompatibel funktion — returnerar aktuell taxa (utan datumhänsyn)
export function getHourlyRate(level: string): number {
  return currentRates[level as ContractLevel] ?? currentRates['3plus'];
}
