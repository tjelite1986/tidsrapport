import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY saknas i miljön' }, { status: 500 });

  try {
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    if (!file) return NextResponse.json({ error: 'Ingen bild angiven' }, { status: 400 });

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Filformat stöds ej. Använd PNG, JPG eller WEBP.' }, { status: 400 });
    }

    const year = parseInt(formData.get('year') as string) || new Date().getFullYear();
    const month = parseInt(formData.get('month') as string) || new Date().getMonth() + 1;

    const MONTH_SV = [
      '', 'januari', 'februari', 'mars', 'april', 'maj', 'juni',
      'juli', 'augusti', 'september', 'oktober', 'november', 'december',
    ];

    // Compute first day of month for reference
    const firstDay = new Date(year, month - 1, 1);
    const firstDayName = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][firstDay.getDay()];
    const daysInMonth = new Date(year, month, 0).getDate();

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: `Detta är ett arbetsschema för ${MONTH_SV[month]} ${year}.

Fakta om månaden:
- Månad: ${month} (${MONTH_SV[month]}) ${year}
- Månadens första dag (dag 1) är en ${firstDayName}
- Månaden har ${daysInMonth} dagar

Bilden visar en kalender. Kolumnerna är veckodagar (mån–sön). Varje cell med ett arbetspass innehåller två tider: starttid (överst) och sluttid (underst), t.ex. "07:00" på rad 1 och "12:00" på rad 2.
Tomma celler = ledig dag, ignorera dessa.

Använd dagsiffrorna som syns i kalenderrutan (t.ex. 1, 2, 3 ... ${daysInMonth}) och matcha dem mot ${MONTH_SV[month]} ${year} för att beräkna exakt datum i formatet YYYY-MM-DD.

Returnera ENBART giltig JSON utan förklaringar, markdown eller kodblock:
{"shifts":[{"date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM"}]}

Inkludera bara dagar med faktiska tider. Sortera på datum.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData?.error?.message || `API-fel: ${response.status}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text?.trim() ?? '';

    // Strip potential markdown code fences
    const jsonStr = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: { shifts: { date: string; startTime: string; endTime: string }[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: 'Kunde inte tolka AI-svaret. Försök igen.', raw: rawText },
        { status: 500 }
      );
    }

    const shifts = (parsed.shifts ?? []).filter(
      (s) => s.date && s.startTime && s.endTime
    );

    return NextResponse.json({ shifts });
  } catch {
    return NextResponse.json({ error: 'Serverfel vid bildanalys' }, { status: 500 });
  }
}
