import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

// ── LINE API ヘルパー ──────────────────────────────────────────
async function getLineImageBuffer(messageId: string, token: string): Promise<Buffer> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`LINE image fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function replyLine(replyToken: string, text: string, token: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
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
}

// ── Claude OCR ────────────────────────────────────────────────
interface ExtractedProperty {
  address: string;
  owner_name: string;
  case_number?: string;
  notes?: string;
}

async function ocrWithClaude(imageBuffer: Buffer): Promise<ExtractedProperty[]> {
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
              media_type: 'image/jpeg',
              data: imageBuffer.toString('base64'),
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

  // JSON部分を抽出
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed) ? parsed : [];
}

// ── 署名検証 ──────────────────────────────────────────────────
function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const hash = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return hash === signature;
}

// ── Webhook ハンドラ ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('x-line-signature');
  const secret    = process.env.LINE_CHANNEL_SECRET ?? '';
  const token     = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

  // 署名検証（LINE_CHANNEL_SECRET未設定の場合はスキップ）
  if (secret !== 'xxx' && !verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: any[];
  try {
    events = JSON.parse(body).events ?? [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  for (const event of events) {
    if (event.type !== 'message') continue;
    const { replyToken, message } = event;

    // ── テキストメッセージ（ヘルプ）──────────────────────────
    if (message.type === 'text') {
      await replyLine(
        replyToken,
        '競売物件リストの画像を送ってください。OCRで物件情報を自動登録します。',
        token
      );
      continue;
    }

    // ── 画像メッセージ → OCR → DB登録 ──────────────────────
    if (message.type === 'image') {
      try {
        // 1. LINEから画像取得
        const imageBuffer = await getLineImageBuffer(message.id, token);

        // 2. Claude APIでOCR
        const properties = await ocrWithClaude(imageBuffer);

        if (properties.length === 0) {
          await replyLine(replyToken, '物件情報を抽出できませんでした。競売物件リストの画像を送ってください。', token);
          continue;
        }

        // 3. Supabaseに登録
        const toInsert = properties
          .filter((p) => p.address && p.owner_name)
          .map((p) => ({
            address:     p.address,
            owner_name:  p.owner_name,
            case_number: p.case_number ?? null,
            notes:       p.notes       ?? null,
            status:      '未訪問',
            rank:        'C',
          }));

        const { data, error } = await supabaseAdmin
          .from('properties')
          .insert(toInsert)
          .select('id');

        if (error) throw error;

        // 4. 結果をLINEに返信
        const lines = [
          `✅ ${data?.length ?? 0}件を登録しました`,
          ``,
          ...properties.slice(0, 5).map(
            (p, i) => `${i + 1}. ${p.owner_name}（${p.address}）`
          ),
          properties.length > 5 ? `...他${properties.length - 5}件` : '',
        ].filter(Boolean);

        await replyLine(replyToken, lines.join('\n'), token);
      } catch (err) {
        console.error('LINE webhook error:', err);
        await replyLine(
          replyToken,
          '処理中にエラーが発生しました。しばらくしてから再試行してください。',
          token
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
