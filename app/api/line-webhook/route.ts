import { NextRequest, NextResponse } from 'next/server';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

// ── LINE API ヘルパー ─────────────────────────────────────────
async function getLineImage(
  messageId: string,
  token: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`LINE image fetch failed: ${res.status} ${res.statusText}`);

  const ct = res.headers.get('content-type') ?? 'image/jpeg';
  const mimeType = ct.split(';')[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

async function replyLine(replyToken: string, text: string, token: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`LINE reply failed: ${res.status}`, body);
  }
}

// ── Claude OCR ───────────────────────────────────────────────
interface ExtractedProperty {
  address: string;
  owner_name: string;
  case_number?: string;
  notes?: string;
}

async function ocrWithClaude(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedProperty[]> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: buffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: `この画像は裁判所の競売物件リストです。以下の情報をJSON配列で抽出してください：
[{"address": "住所", "owner_name": "所有者名", "case_number": "事件番号", "notes": "備考"}]
JSONのみ返してください。物件が見つからない場合は空配列 [] を返してください。`,
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  console.log('Claude raw response:', text.slice(0, 500));

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed) ? parsed : [];
}

// ── 署名検証 ─────────────────────────────────────────────────
function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto');
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return hash === signature;
}

// ── Webhook ハンドラ ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('x-line-signature');
  const secret    = process.env.LINE_CHANNEL_SECRET ?? '';
  const token     = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  if (secret && secret !== 'xxx' && !verifySignature(body, signature, secret)) {
    console.error('Signature mismatch');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: any[];
  try {
    events = JSON.parse(body).events ?? [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const event of events) {
    if (event.type !== 'message') continue;
    const { replyToken, message } = event;

    // テキスト → ヘルプ返信
    if (message.type === 'text') {
      await replyLine(
        replyToken,
        '競売物件リストの画像を送ってください。\nOCRで物件情報を解析します。',
        token
      );
      continue;
    }

    // 画像 → OCR → DB保存 → 結果返信
    if (message.type === 'image') {
      try {
        const { buffer, mimeType } = await getLineImage(message.id, token);
        console.log(`Image received: ${mimeType}, size: ${buffer.length} bytes`);

        const properties = await ocrWithClaude(buffer, mimeType);
        console.log(`Extracted ${properties.length} properties`);

        if (properties.length === 0) {
          await replyLine(
            replyToken,
            '物件情報を抽出できませんでした。\n競売物件リストの画像を送ってください。',
            token
          );
          continue;
        }

        // Supabase REST API で保存
        const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const toInsert = properties
          .filter((p) => p.address)
          .map((p) => ({
            address:     p.address,
            owner_name:  p.owner_name,
            case_number: p.case_number ?? null,
            notes:       p.notes       ?? null,
            status:      '未訪問',
            rank:        'C',
          }));

        const insertRes = await fetch(`${sbUrl}/rest/v1/properties`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey':        sbKey,
            'Authorization': `Bearer ${sbKey}`,
            'Prefer':        'return=representation',
          },
          body: JSON.stringify(toInsert),
        });

        if (!insertRes.ok) {
          const errBody = await insertRes.text();
          throw new Error(`Supabase insert failed: ${insertRes.status} ${errBody}`);
        }

        const inserted: { id: string }[] = await insertRes.json();

        const lines = [
          `✅ ${inserted.length}件を登録しました`,
          '',
          ...properties.slice(0, 5).map((p) => [
            `・住所：${p.address}`,
            `・所有者：${p.owner_name}`,
            ...(p.case_number ? [`・事件番号：${p.case_number}`] : []),
          ].join('\n')),
          ...(properties.length > 5 ? [`...他${properties.length - 5}件`] : []),
        ];

        await replyLine(replyToken, lines.join('\n\n'), token);

      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error('LINE webhook error:', msg, err?.stack);
        await replyLine(
          replyToken,
          `⚠️ エラーが発生しました\n${msg.slice(0, 200)}`,
          token
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
