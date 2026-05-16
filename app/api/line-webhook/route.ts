import { NextRequest, NextResponse } from 'next/server';
import { addPrefecture } from '@/lib/address';
import { autoGeocode } from '@/lib/geocode';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

// ── LINE API ヘルパー ─────────────────────────────────────────
async function getLineImage(messageId: string, token: string): Promise<{ buffer: Buffer; mimeType: string }> {
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) console.error(`LINE reply failed: ${res.status}`, await res.text());
}

// ── line_context ──────────────────────────────────────────────
async function saveHaitoDate(lineUserId: string, haitoDate: string, sbUrl: string, sbKey: string) {
  await fetch(`${sbUrl}/rest/v1/line_context`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ line_user_id: lineUserId, haito_date: haitoDate, updated_at: new Date().toISOString() }),
  });
}

// 保存済み配当日を取得（24時間で期限切れ）
async function getStoredContext(lineUserId: string, sbUrl: string, sbKey: string): Promise<{ haitoDate: string; updatedAt: Date } | null> {
  const res = await fetch(
    `${sbUrl}/rest/v1/line_context?line_user_id=eq.${encodeURIComponent(lineUserId)}&select=haito_date,updated_at`,
    { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
  );
  if (!res.ok) return null;
  const data: { haito_date: string; updated_at: string }[] = await res.json();
  if (!data[0]) return null;
  const updatedAt = new Date(data[0].updated_at);
  const hoursElapsed = (Date.now() - updatedAt.getTime()) / 3600000;
  if (hoursElapsed > 24) return null; // 24時間で期限切れ
  return { haitoDate: data[0].haito_date, updatedAt };
}

// 直近バッチの配当日を一括修正
async function fixRecentBatch(
  lineUserId: string, newDate: string, sbUrl: string, sbKey: string
): Promise<number> {
  const ctx = await getStoredContext(lineUserId, sbUrl, sbKey);
  if (!ctx) return 0;
  const windowStart = new Date(ctx.updatedAt.getTime() - 2 * 3600000).toISOString();
  const res = await fetch(
    `${sbUrl}/rest/v1/properties?haito_date=eq.${ctx.haitoDate}&created_at=gte.${windowStart}&status=eq.未訪問&rank=eq.C`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ haito_date: newDate }),
    }
  );
  if (!res.ok) return 0;
  const updated: any[] = await res.json();
  return updated.length;
}

// ── Claude OCR ───────────────────────────────────────────────
interface ExtractedProperty {
  address: string;
  owner_name: string;
  case_number?: string;
  haito_date?: string;
  notes?: string;
}

async function ocrWithClaude(buffer: Buffer, mimeType: string): Promise<ExtractedProperty[]> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [{
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
          text: `この画像は裁判所の競売物件に関する書類です。以下の情報をJSON配列で抽出してください：
[{
  "address": "住所・所在地",
  "owner_name": "所有者名・債務者名",
  "case_number": "事件番号（例: 令和8年(ヌ)第4号）",
  "haito_date": "配当要求終期日（YYYY-MM-DD形式。書類に記載がなければnull）",
  "notes": "備考"
}]
JSONのみ返してください。物件が見つからない場合は空配列 [] を返してください。`,
        },
      ],
    }],
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

function extractDate(text: string): string | null {
  const m = text.match(/(\d{4})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

// ── Webhook ハンドラ ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('x-line-signature');
  const secret    = process.env.LINE_CHANNEL_SECRET ?? '';
  const token     = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  const sbUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const sbKey     = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
    const lineUserId: string = event.source?.userId ?? 'unknown';

    // テキストメッセージ
    if (message.type === 'text') {
      const text: string = message.text.trim();

      // 「配当日修正 YYYY-MM-DD」→ 直近バッチを一括更新
      if (text.includes('修正')) {
        const newDate = extractDate(text);
        if (newDate) {
          const count = await fixRecentBatch(lineUserId, newDate, sbUrl, sbKey);
          await saveHaitoDate(lineUserId, newDate, sbUrl, sbKey);
          await replyLine(
            replyToken,
            count > 0
              ? `✅ ${count}件の配当日を ${newDate} に修正しました。`
              : `⚠️ 修正対象が見つかりませんでした。\n（登録から2時間以上経過している場合は直接アプリから編集してください）`,
            token
          );
          continue;
        }
      }

      // 「YYYY-MM-DD」など日付のみ → 配当日を設定
      const dateStr = extractDate(text);
      if (dateStr) {
        await saveHaitoDate(lineUserId, dateStr, sbUrl, sbKey);
        await replyLine(
          replyToken,
          `📅 配当日を ${dateStr} に設定しました。\n次に送った画像にこの日付が使われます。\n※24時間で自動リセットされます。\n\n日付を間違えた場合：「修正 YYYY-MM-DD」と送ってください。`,
          token
        );
        continue;
      }

      // その他テキスト → ヘルプ
      await replyLine(
        replyToken,
        '競売物件リストの画像を送ってください。\nOCRで物件情報を解析します。\n\n📅 配当日を設定するには日付を送ってください。\n例：2026-06-30\n\n🔧 日付を間違えた場合：\n「修正 2026-07-31」と送ると直近の登録分を一括更新できます。',
        token
      );
      continue;
    }

    // 画像 → OCR → DB保存
    if (message.type === 'image') {
      const sendDate: string = new Date(event.timestamp).toISOString().split('T')[0];

      try {
        const { buffer, mimeType } = await getLineImage(message.id, token);
        console.log(`Image received: ${mimeType}, size: ${buffer.length} bytes`);

        const ctx = await getStoredContext(lineUserId, sbUrl, sbKey);
        const usedHaitoDate = ctx?.haitoDate ?? sendDate;

        const properties = await ocrWithClaude(buffer, mimeType);
        console.log(`Extracted ${properties.length} properties`);

        if (properties.length === 0) {
          await replyLine(replyToken, '物件情報を抽出できませんでした。\n競売物件リストの画像を送ってください。', token);
          continue;
        }

        const valid = properties.filter((p) => p.address);

        // 重複チェック: case_number がある物件は既存レコードを検索
        const caseNumbers = valid.map((p) => p.case_number).filter(Boolean) as string[];
        let existingMap: Record<string, string> = {}; // case_number → id
        if (caseNumbers.length > 0) {
          const filter = caseNumbers.map((n) => `case_number.eq.${encodeURIComponent(n)}`).join(',');
          const existRes = await fetch(
            `${sbUrl}/rest/v1/properties?or=(${filter})&select=id,case_number`,
            { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
          );
          if (existRes.ok) {
            const rows: { id: string; case_number: string }[] = await existRes.json();
            rows.forEach((r) => { existingMap[r.case_number] = r.id; });
          }
        }

        const toInsert: object[] = [];
        let updateCount = 0;

        for (const p of valid) {
          const mapped = {
            address:     addPrefecture(p.address),
            owner_name:  p.owner_name || '不明',
            case_number: p.case_number ?? null,
            haito_date:  p.haito_date ?? usedHaitoDate,
            notes:       p.notes ?? null,
          };

          const existingId = p.case_number ? existingMap[p.case_number] : undefined;
          if (existingId) {
            // 既存レコードを更新（ステータス・ランク・担当者は保持）
            await fetch(`${sbUrl}/rest/v1/properties?id=eq.${existingId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`,
              },
              body: JSON.stringify({ ...mapped, updated_at: new Date().toISOString() }),
            });
            updateCount++;
          } else {
            toInsert.push({ ...mapped, status: '未訪問', rank: 'C' });
          }
        }

        let insertedCount = 0;
        if (toInsert.length > 0) {
          const insertRes = await fetch(`${sbUrl}/rest/v1/properties`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`,
              'Prefer': 'return=representation',
            },
            body: JSON.stringify(toInsert),
          });
          if (!insertRes.ok) throw new Error(`Supabase insert failed: ${insertRes.status} ${await insertRes.text()}`);
          const inserted: { id: string }[] = await insertRes.json();
          insertedCount = inserted.length;
        }
        autoGeocode(3).catch(() => {});

        // updated_at を更新してバッチ時刻を記録（修正コマンド用）
        await saveHaitoDate(lineUserId, usedHaitoDate, sbUrl, sbKey);

        const dateLabel = ctx ? `${usedHaitoDate}（設定済み）` : `${usedHaitoDate}（送信日）`;
        const summary = [insertedCount > 0 ? `新規${insertedCount}件` : null, updateCount > 0 ? `更新${updateCount}件` : null].filter(Boolean).join('・') || '変更なし';
        const lines = [
          `✅ ${summary}`,
          `📅 配当日：${dateLabel}`,
          '',
          ...properties.slice(0, 5).map((p) => [
            `・住所：${p.address}`,
            `・所有者：${p.owner_name}`,
            ...(p.case_number ? [`・事件番号：${p.case_number}`] : []),
          ].join('\n')),
          ...(properties.length > 5 ? [`...他${properties.length - 5}件`] : []),
          '',
          '日付が違う場合：「修正 YYYY-MM-DD」と送ってください。',
        ];
        await replyLine(replyToken, lines.join('\n\n'), token);

      } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.error('LINE webhook error:', msg, err?.stack);
        await replyLine(replyToken, `⚠️ エラーが発生しました\n${msg.slice(0, 200)}`, token);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
