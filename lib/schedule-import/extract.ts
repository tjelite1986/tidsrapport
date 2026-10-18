import { requestVisionJson, stripJsonFences, VisionJsonError, type VisionImage } from '@/lib/ai/vision-json';
import { parseMonthText, type ScheduleRow } from './resolve';

export type ScheduleGrid = {
  rows: ScheduleRow[];
  /** YYYY-MM when the image shows a month heading, else null. */
  hintMonth: string | null;
  provider: 'openrouter' | 'anthropic';
  model: string;
};

export class ScheduleExtractionError extends Error {}

/**
 * The model transcribes the grid; it does not date anything. Dates come from
 * week number + column + day number in resolveSchedule(), which is exact where
 * a model's month guess is not.
 */
const SCHEDULE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    monthText: {
      type: 'string',
      description: 'Month heading if one is printed in the image, e.g. "mars 2026". Empty string when none is visible.',
    },
    rows: {
      type: 'array',
      description: 'One entry per calendar row (week), top to bottom.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          weekNumber: {
            type: 'integer',
            description: 'The week number printed at the left edge of the row. 0 when no week number is visible for the row.',
          },
          cells: {
            type: 'array',
            description: 'Every cell in the row that shows a day number, including empty days and greyed-out days.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                column: { type: 'integer', description: 'Column position from the left: 0 = Monday, 1 = Tuesday … 6 = Sunday.' },
                day: { type: 'integer', description: 'The day-of-month number printed in the cell.' },
                greyed: { type: 'boolean', description: 'True when the cell is rendered greyed out as a day of a neighbouring month.' },
                startTime: { type: 'string', description: 'Upper time in the shift box, HH:MM. Empty string when the cell has no shift.' },
                endTime: { type: 'string', description: 'Lower time in the shift box, HH:MM. Empty string when the cell has no shift.' },
              },
              required: ['column', 'day', 'greyed', 'startTime', 'endTime'],
            },
          },
        },
        required: ['weekNumber', 'cells'],
      },
    },
  },
  required: ['monthText', 'rows'],
};

const SYSTEM_PROMPT = `You transcribe screenshots of a Swedish work-schedule calendar into JSON. Transcribe only; never calculate dates.

The layout: a month grid with one row per week. A number at the far left of a row is the ISO week number (sometimes prefixed "v" or "v."). The seven columns are Monday to Sunday, left to right. Each cell shows a day-of-month number at the top. A cell with a shift shows a dark box with two times: the start time above the end time (e.g. "07:00" over "12:00"). Cells without such a box are days off. Days that belong to the previous or next month are greyed out.

Rules:
- Return every row that is at least partly visible, top to bottom, and every cell in it that shows a day number.
- Column is the position from the left (0 = Monday … 6 = Sunday), not derived from the day number.
- Copy the week number exactly as printed; use 0 when the row has none visible.
- Copy times exactly as printed (HH:MM). A cell without a shift box gets empty strings.
- Ignore icons, dots and colours other than the greyed-out styling.
- monthText is only for a heading that literally shows a month name and year; otherwise an empty string.`;

const USER_PROMPT = 'Transcribe this schedule screenshot: week numbers, every day cell with its column position and day number, and the start and end time of each shift box.';

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function parseGrid(content: string): { rows: ScheduleRow[]; hintMonth: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(content));
  } catch {
    throw new ScheduleExtractionError('The AI answer could not be read as JSON');
  }
  const obj = parsed as Record<string, unknown>;
  const rows: ScheduleRow[] = [];
  if (Array.isArray(obj.rows)) {
    for (const rawRow of obj.rows) {
      if (!rawRow || typeof rawRow !== 'object') continue;
      const row = rawRow as Record<string, unknown>;
      const weekNumber = toInt(row.weekNumber);
      const cells: ScheduleRow['cells'] = [];
      if (Array.isArray(row.cells)) {
        for (const rawCell of row.cells) {
          if (!rawCell || typeof rawCell !== 'object') continue;
          const c = rawCell as Record<string, unknown>;
          const column = toInt(c.column);
          const day = toInt(c.day);
          if (column === null || day === null) continue;
          cells.push({
            column,
            day,
            greyed: c.greyed === true,
            startTime: typeof c.startTime === 'string' ? c.startTime : '',
            endTime: typeof c.endTime === 'string' ? c.endTime : '',
          });
        }
      }
      rows.push({ weekNumber: weekNumber !== null && weekNumber > 0 ? weekNumber : null, cells });
    }
  }
  return { rows, hintMonth: parseMonthText(obj.monthText) };
}

/** Read the calendar grid off a schedule screenshot. */
export async function extractScheduleGrid(image: VisionImage): Promise<ScheduleGrid> {
  let result;
  try {
    result = await requestVisionJson({
      system: SYSTEM_PROMPT,
      user: USER_PROMPT,
      image,
      schemaName: 'schedule_grid',
      schema: SCHEDULE_SCHEMA,
      maxTokens: 6000,
    });
  } catch (err) {
    if (err instanceof VisionJsonError) throw new ScheduleExtractionError(err.message);
    throw err;
  }
  const grid = parseGrid(result.content);
  return { ...grid, provider: result.provider, model: result.model };
}
