import type { PayslipFileType } from './files';

export type ExtractedPayslip = {
  payMonth: string | null;
  grossPay: number | null;
  tax: number | null;
  netPay: number | null;
};

export type ExtractionResult = ExtractedPayslip & {
  provider: 'openrouter' | 'anthropic';
  model: string;
};

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
    grossPay: { type: ['number', 'null'], description: 'Bruttolön i kronor' },
    tax: { type: ['number', 'null'], description: 'Preliminärskatt i kronor, alltid positivt tal' },
    netPay: { type: ['number', 'null'], description: 'Nettolön/utbetalt belopp i kronor' },
  },
  required: ['payMonth', 'grossPay', 'tax', 'netPay'],
} as const;

const SYSTEM_PROMPT = `Du läser svenska lönespecifikationer och returnerar strukturerad JSON.

Regler:
- payMonth är UTBETALNINGSmånaden (YYYY-MM), tagen från utbetalningsdatumet — inte löneperioden/arbetsmånaden. Saknas utbetalningsdatum: använd månaden efter löneperiodens slut.
- grossPay är bruttolönen (kan heta "Bruttolön", "Summa lön", "Skattepliktig bruttolön").
- tax är den preliminära skatten som ett POSITIVT tal, även om den står med minustecken.
- netPay är beloppet som betalas ut ("Nettolön", "Att utbetala", "Utbetalt belopp").
- Belopp returneras som tal utan tusentalsavgränsare, med decimaler om de finns.
- Hittar du inte ett värde med säkerhet: returnera null för det fältet. Gissa aldrig.`;

const USER_PROMPT =
  'Läs av denna lönespecifikation och returnera utbetalningsmånad, bruttolön, preliminärskatt och nettolön.';

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

  const payMonth = typeof obj.payMonth === 'string' && /^\d{4}-\d{2}$/.test(obj.payMonth) ? obj.payMonth : null;
  const tax = num(obj.tax);

  return {
    payMonth,
    grossPay: num(obj.grossPay),
    // The tax line is printed with a minus sign on most payslips; the app stores it positive.
    tax: tax === null ? null : Math.abs(tax),
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
    max_tokens: 2000,
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
      max_tokens: 2000,
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
