export type ContractLevel =
  | '16ar'
  | '17ar'
  | '18ar'
  | '19ar'
  | '1ar_erf'
  | '2ar'
  | '3plus';

export const contractLevels: Record<ContractLevel, { label: string; hourlyRate: number }> = {
  '16ar': { label: '16 år', hourlyRate: 101.48 },
  '17ar': { label: '17 år', hourlyRate: 103.95 },
  '18ar': { label: '18 år', hourlyRate: 155.51 },
  '19ar': { label: '19 år', hourlyRate: 157.44 },
  '1ar_erf': { label: '1 års erfarenhet', hourlyRate: 160.95 },
  '2ar': { label: '2 års erfarenhet', hourlyRate: 162.98 },
  '3plus': { label: '3+ års erfarenhet', hourlyRate: 165.84 },
};

export function getHourlyRate(level: string): number {
  return contractLevels[level as ContractLevel]?.hourlyRate ?? contractLevels['3plus'].hourlyRate;
}
