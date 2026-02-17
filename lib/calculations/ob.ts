import { timeToMinutes, splitTimeRange, type TimeSegment } from './time-utils';
import { isRedDay, isHalfDay, isDayBeforeRedDay, getHolidays, type Holiday } from './holidays';

export type WorkplaceType = 'butik' | 'lager' | 'none';

export interface OBSegment {
  startMinutes: number;
  endMinutes: number;
  hours: number;
  obPercent: number;
  obAmount: number; // hourlyRate * obPercent/100 * hours
}

export interface OBResult {
  segments: OBSegment[];
  totalOBAmount: number;
  regularHours: number;
  obHours: number;
}

// Get day of week: 0=Monday, 6=Sunday
function getDayOfWeek(date: string): number {
  const d = new Date(date + 'T12:00:00');
  const jsDay = d.getDay(); // 0=Sunday
  return jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Monday
}

function getButikOBPercent(
  segStartMin: number,
  date: string,
  holidays: Holiday[]
): number {
  const dayOfWeek = getDayOfWeek(date);
  const isSunday = dayOfWeek === 6;
  const isSaturday = dayOfWeek === 5;
  const isRed = isRedDay(date, holidays);

  // Red days and Sundays: 100%
  if (isRed || isSunday) return 100;

  // Saturday after 12:00
  if (isSaturday) {
    const normalizedMin = segStartMin % 1440;
    if (normalizedMin >= 720) return 100; // 12:00+
    return 0;
  }

  // Mon-Fri evening OB
  const normalizedMin = segStartMin % 1440;
  if (normalizedMin >= 1200) return 70; // After 20:00
  if (normalizedMin >= 1095) return 50; // After 18:15
  return 0;
}

function getLagerOBPercent(
  segStartMin: number,
  date: string,
  holidays: Holiday[]
): number {
  const dayOfWeek = getDayOfWeek(date);
  const isSunday = dayOfWeek === 6;
  const isSaturday = dayOfWeek === 5;
  const isMonday = dayOfWeek === 0;
  const isRed = isRedDay(date, holidays);
  const normalizedMin = segStartMin % 1440;

  // Red days and Sundays: 100%
  if (isRed || isSunday) return 100;

  // Saturday
  if (isSaturday) {
    if (normalizedMin < 360 || normalizedMin >= 1380) return 70; // 00-06, 23-24
    return 40; // 06-23
  }

  // Monday
  if (isMonday) {
    if (normalizedMin < 360) return 70; // 00-06
    if (normalizedMin >= 1080 && normalizedMin < 1380) return 40; // 18-23
    if (normalizedMin >= 1380) return 70; // 23-24
    return 0;
  }

  // Tue-Fri
  if (normalizedMin < 360) return 70; // 00-06
  if (normalizedMin >= 360 && normalizedMin < 420) return 40; // 06-07
  if (normalizedMin >= 1080 && normalizedMin < 1380) return 40; // 18-23
  if (normalizedMin >= 1380) return 70; // 23-24
  return 0;
}

// OB boundaries in minutes from midnight
const butikBoundaries = [
  0, 720, 1095, 1200, 1440, // midnight, 12:00, 18:15, 20:00, midnight
];

const lagerBoundaries = [
  0, 360, 420, 1080, 1380, 1440, // midnight, 06:00, 07:00, 18:00, 23:00, midnight
];

export function calculateOB(
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes: number,
  hourlyRate: number,
  workplaceType: WorkplaceType
): OBResult {
  if (workplaceType === 'none') {
    const startMin = timeToMinutes(startTime);
    let endMin = timeToMinutes(endTime);
    if (endMin <= startMin) endMin += 1440;
    const totalHours = Math.max(0, (endMin - startMin - breakMinutes) / 60);
    return {
      segments: [],
      totalOBAmount: 0,
      regularHours: totalHours,
      obHours: 0,
    };
  }

  const boundaries = workplaceType === 'butik' ? butikBoundaries : lagerBoundaries;
  const year = parseInt(date.split('-')[0]);
  const holidays = getHolidays(year);

  const timeSegments = splitTimeRange(startTime, endTime, breakMinutes, boundaries);

  const obSegments: OBSegment[] = [];
  let totalOBAmount = 0;
  let obHours = 0;
  let regularHours = 0;

  for (const seg of timeSegments) {
    const getPercent = workplaceType === 'butik' ? getButikOBPercent : getLagerOBPercent;

    // For overnight shifts, determine which date the segment falls on
    let segDate = date;
    if (seg.startMinutes >= 1440) {
      const d = new Date(date + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      segDate = d.toISOString().split('T')[0];
    }

    const obPercent = getPercent(seg.startMinutes, segDate, holidays);
    const obAmount = hourlyRate * (obPercent / 100) * seg.hours;

    obSegments.push({
      startMinutes: seg.startMinutes,
      endMinutes: seg.endMinutes,
      hours: seg.hours,
      obPercent,
      obAmount,
    });

    if (obPercent > 0) {
      obHours += seg.hours;
      totalOBAmount += obAmount;
    } else {
      regularHours += seg.hours;
    }
  }

  return {
    segments: obSegments,
    totalOBAmount,
    regularHours,
    obHours,
  };
}
