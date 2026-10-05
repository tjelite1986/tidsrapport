import type { PayslipFileType } from './files';
import { parseObLines, type ObLine } from './fields';

export type ExtractedPayslip = {
  payMonth: string | null;
  workHours: number | null;
  hourlyRate: number | null;
  basePay: number | null;
  obLines: ObLine[] | null;
  totalOB: number | null;
  overtimeMertid: number | null;
  overtimeEnkel: number | null;
  overtimeKvalificerad: number | null;
  sickHours: number | null;
  karensHours: number | null;
  sickPay: number | null;
  vacationPay: number | null;
  vacationDaysPay: number | null;
  vacationDaysCount: number | null;
  grossPay: number | null;
  tax: number | null;
  netPay: number | null;
};

export type ExtractionResult = ExtractedPayslip & {
  provider: 'openrouter' | 'anthropic';
  model: string;
};

const amount = (description: string) => ({ type: ['number', 'null'], description });

/**
 * JSON schema the model must answer with. Every field is nullable so the model
 * can say "stod inte i specen" instead of inventing a number — a guessed amount
 * is worse than an empty field the user fills in by hand.
 */
const PAYSLIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    payMonth: {
      type: ['string', 'null'],
      description: 'Utbetalningsmånad som YYYY-MM, hämtad från utbetalningsdatumet',
    },
    workHours: amount('Antal arbetade timmar som grundlönen räknats på'),
    hourlyRate: amount('Timlön (a-pris) i kronor'),
    basePay: amount('Grundlön/tidlön i kronor, utan OB, övertid och tillägg'),
    obLines: {
      type: ['array', 'null'],
      description: 'En rad per OB-procentsats som finns på specen',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          percent: { type: 'number', description: 'OB-procent, t.ex. 50, 70 eller 100' },
          hours: amount('Antal OB-timmar på raden'),
          amount: amount('OB-belopp på raden i kronor'),
        },
        required: ['percent', 'hours', 'amount'],
      },
    },
    totalOB: amount('Summa OB-tillägg i kronor'),
    overtimeMertid: amount('Mertid i kronor'),
    overtimeEnkel: amount('Enkel övertid i kronor'),
    overtimeKvalificerad: amount('Kvalificerad övertid i kronor'),
    sickHours: amount('Antal sjuktimmar som sjuklön betalats för'),
    karensHours: amount('Antal karenstimmar (karensavdrag i timmar)'),
    sickPay: amount('Sjuklön i kronor (positivt tal), inte sjukavdraget'),
    vacationPay: amount('Semesterersättning i kronor'),
    vacationDaysPay: amount('Semesterlön för uttagna semesterdagar i kronor'),
    vacationDaysCount: amount('Antal uttagna semesterdagar'),
    grossPay: amount('Bruttolön i kronor'),
    tax: amount('Preliminärskatt i kronor, alltid positivt tal'),
    netPay: amount('Nettolön/utbetalt belopp i kronor'),
  },
  required: [
    'payMonth',
    'workHours',
    'hourlyRate',
    'basePay',
    'obLines',
    'totalOB',
    'overtimeMertid',
    'overtimeEnkel',
    'overtimeKvalificerad',
    'sickHours',
    'karensHours',
    'sickPay',
    'vacationPay',
    'vacationDaysPay',
    'vacationDaysCount',
    'grossPay',
    'tax',
    'netPay',
  ],
} as const;

const SYSTEM_PROMPT = `Du läser svenska lönespecifikationer och returnerar strukturerad JSON.

Regler:
- payMonth är UTBETALNINGSmånaden (YYYY-MM), tagen från utbetalningsdatumet — inte löneperioden/arbetsmånaden. Saknas utbetalningsdatum: använd månaden efter löneperiodens slut.
- basePay är grundlönen/tidlönen (kan heta "Tidlön", "Månadslön", "Timlön"), utan OB, övertid och tillägg. workHours är timmarna den raden räknats på och hourlyRate dess a-pris.
- obLines är en rad per OB-procentsats som står på specen ("OB 50%", "Storhelgstillägg 100%"). Ta med både timmar och belopp när båda står. totalOB är summan av OB-raderna.
- Övertid delas upp i mertid, enkel övertid och kvalificerad övertid. Står bara en klumpsumma: lägg den i den rad som texten anger, annars null.
- sickPay är sjuklön som POSITIVT tal — sjukavdraget är en annan rad och ska inte med. sickHours är timmarna sjuklönen avser, karensHours timmarna på karensraden (t.ex. "Karens 4,75 Tim").
- vacationPay är semesterersättning (ofta en procentsats av bruttolönen). vacationDaysPay och vacationDaysCount avser uttagna semesterdagar.
- grossPay är bruttolönen (kan heta "Bruttolön", "Summa lön", "Skattepliktig bruttolön").
- tax är den preliminära skatten som ett POSITIVT tal, även om den står med minustecken.
- netPay är beloppet som betalas ut ("Nettolön", "Att utbetala", "Utbetalt belopp").
- Belopp returneras som tal utan tusentalsavgränsare, med decimaler om de finns.
- Hittar du inte ett värde med säkerhet: returnera null för det fältet. Gissa aldrig.`;

const USER_PROMPT =
  'Läs av denna lönespecifikation och returnera alla lönerader du hittar: arbetade timmar, timlön, grundlön, OB per procentsats, övertid, sjuklön, semester, bruttolön, preliminärskatt och nettolön.';

export class PayslipExtractionError extends Error {}

function parseModelJson(content: string): ExtractedPayslip {
  // Some providers wrap JSON in markdown fences despite response_format
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new PayslipExtractionError('AI-svaret gick inte att tolka som JSON');
  }
  const obj = parsed as Record<string, unknown>;

  const num = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value.replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  // A model that returns a negative deduction still means "this much sick pay"
  const positive = (value: unknown): number | null => {
    const n = num(value);
    return n === null ? null : Math.abs(n);
  };

  const payMonth = typeof obj.payMonth === 'string' && /^\d{4}-\d{2}$/.test(obj.payMonth) ? obj.payMonth : null;
  // Malformed OB lines read as "found none" — the rest of the spec is still useful
  const obLines = parseObLines(obj.obLines) ?? null;

  return {
    payMonth,
    workHours: num(obj.workHours),
    hourlyRate: num(obj.hourlyRate),
    basePay: num(obj.basePay),
    obLines,
    totalOB: num(obj.totalOB),
    overtimeMertid: num(obj.overtimeMertid),
    overtimeEnkel: num(obj.overtimeEnkel),
    overtimeKvalificerad: num(obj.overtimeKvalificerad),
    sickHours: positive(obj.sickHours),
    karensHours: positive(obj.karensHours),
    sickPay: positive(obj.sickPay),
    vacationPay: num(obj.vacationPay),
    vacationDaysPay: num(obj.vacationDaysPay),
    vacationDaysCount: num(obj.vacationDaysCount),
    grossPay: num(obj.grossPay),
    // The tax line is printed with a minus sign on most payslips; the app stores it positive.
    tax: positive(obj.tax),
    netPay: num(obj.netPay),
  };
}

/** OpenRouter's OpenAI-shaped API — this is where the account with credit is. */
async function extractViaOpenRouter(
  apiKey: string,
  data: Buffer,
  type: PayslipFileType,
): Promise<ExtractionResult> {
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-opus-5';
  const base64 = data.toString('base64');

  const filePart =
    type.mimeType === 'application/pdf'
      ? {
          type: 'file',
          file: { filename: `lonespec${type.extension}`, file_data: `data:application/pdf;base64,${base64}` },
        }
      : { type: 'image_url', image_url: { url: `data:${type.mimeType};base64,${base64}` } };

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [filePart, { type: 'text', text: USER_PROMPT }] },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'payslip', strict: true, schema: PAYSLIP_SCHEMA },
    },
  };
  if (type.mimeType === 'application/pdf') {
    // Let the model read the PDF itself instead of paying for OCR — a scanned
    // spec is rendered as pages, a digital one keeps its text layer.
    body.plugins = [{ id: 'file-parser', pdf: { engine: 'native' } }];
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tidrapport.mecloud.win',
      'X-Title': 'Tidsrapport',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new PayslipExtractionError(`OpenRouter svarade ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  if (!content) {
    throw new PayslipExtractionError('AI-tjänsten returnerade inget svar');
  }

  return { ...parseModelJson(content), provider: 'openrouter', model };
}

/** Anthropic direct — same prompt and schema, used when only that key is set. */
async function extractViaAnthropic(
  apiKey: string,
  data: Buffer,
  type: PayslipFileType,
): Promise<ExtractionResult> {
  const model = process.env.CLAUDE_MODEL ?? 'claude-opus-5';
  const base64 = data.toString('base64');

  const filePart =
    type.mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: type.mimeType, data: base64 } };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: PAYSLIP_SCHEMA } },
      messages: [{ role: 'user', content: [filePart, { type: 'text', text: USER_PROMPT }] }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new PayslipExtractionError(`Anthropic svarade ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string = json?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
  if (!content) {
    throw new PayslipExtractionError('AI-tjänsten returnerade inget svar');
  }

  return { ...parseModelJson(content), provider: 'anthropic', model };
}

export function isExtractionConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Read the amounts off a payslip. OpenRouter wins when both keys are set — the
 * Anthropic key on these machines has no credit.
 */
export async function extractPayslipFields(data: Buffer, type: PayslipFileType): Promise<ExtractionResult> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const provider = process.env.PAYSLIP_AI_PROVIDER;

  if (openrouterKey && provider !== 'anthropic') {
    return extractViaOpenRouter(openrouterKey, data, type);
  }
  if (anthropicKey) {
    return extractViaAnthropic(anthropicKey, data, type);
  }
  throw new PayslipExtractionError('Ingen AI-nyckel konfigurerad (OPENROUTER_API_KEY eller ANTHROPIC_API_KEY)');
}
