/**
 * One vision call that must answer with JSON matching a schema. OpenRouter
 * first — the Anthropic key on these machines has no credit — with the same
 * prompt and schema sent straight to Anthropic when only that key is set.
 *
 * The schema is compiled by Anthropic even through OpenRouter, so keep it
 * free of optional properties and of more than a handful of union types.
 */

export type VisionImage = {
  mimeType: string;
  data: Buffer;
};

export type VisionJsonRequest = {
  system: string;
  user: string;
  image: VisionImage;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
};

export type VisionJsonResult = {
  /** The model's raw answer, expected to be JSON (possibly fenced). */
  content: string;
  provider: 'openrouter' | 'anthropic';
  model: string;
};

export class VisionJsonError extends Error {}

export function isVisionConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** Strip markdown fences some providers wrap around JSON despite response_format. */
export function stripJsonFences(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function viaOpenRouter(apiKey: string, req: VisionJsonRequest): Promise<VisionJsonResult> {
  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-opus-5';
  const dataUrl = `data:${req.image.mimeType};base64,${req.image.data.toString('base64')}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tidrapport.mecloud.win',
      'X-Title': 'Tidsrapport',
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 4000,
      messages: [
        { role: 'system', content: req.system },
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: req.user }],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: req.schemaName, strict: true, schema: req.schema },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new VisionJsonError(`OpenRouter answered ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  // OpenRouter can answer 200 with an error body, e.g. a schema the provider rejects
  if (json?.error) {
    throw new VisionJsonError(`OpenRouter error: ${String(json.error.message ?? 'unknown error').slice(0, 200)}`);
  }
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  if (!content) throw new VisionJsonError('The AI service returned an empty answer');
  return { content, provider: 'openrouter', model };
}

async function viaAnthropic(apiKey: string, req: VisionJsonRequest): Promise<VisionJsonResult> {
  const model = process.env.CLAUDE_MODEL || 'claude-opus-5';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 4000,
      system: req.system,
      output_config: { format: { type: 'json_schema', schema: req.schema } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: req.image.mimeType, data: req.image.data.toString('base64') } },
            { type: 'text', text: req.user },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new VisionJsonError(`Anthropic answered ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const content: string = json?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
  if (!content) throw new VisionJsonError('The AI service returned an empty answer');
  return { content, provider: 'anthropic', model };
}

export async function requestVisionJson(req: VisionJsonRequest): Promise<VisionJsonResult> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const provider = process.env.PAYSLIP_AI_PROVIDER;

  if (openrouterKey && provider !== 'anthropic') return viaOpenRouter(openrouterKey, req);
  if (anthropicKey) return viaAnthropic(anthropicKey, req);
  throw new VisionJsonError('No AI key configured (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)');
}
