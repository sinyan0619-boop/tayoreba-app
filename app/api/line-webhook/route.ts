import { NextRequest, NextResponse } from 'next/server';
import { addPrefecture } from '@/lib/address';
import { autoGeocode } from '@/lib/geocode';
import { createAdminClient } from '@/lib/supabase';
import { normalizeAddress, caseKeyFromShorthand, caseKeyFromTitle, normalizeCaseReference } from '@/lib/normalize';
import { createNotionCase, updateNotionCaseFromLine } from '@/lib/notion';

export const runtime    = 'nodejs';
export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

// ── LINE API ヘルパー ─────────────────────────────────────────
async function getLineContent(messageId: string, token: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`LINE content fetch failed: ${res.status} ${res.statusText}`);
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
// グループ発言は "{groupId}:{userId}"、1対1は userId をキーにして会話状態を分離する
function contextKeyOf(lineUserId: string, groupId?: string | null): string {
  return groupId ? `${groupId}:${lineUserId}` : lineUserId;
}

interface LineContext {
  haitoDate: string;
  updatedAt: Date;
  propertyId?: string;
  candidates?: { id: string; name: string; address: string }[];
  lastReportPropertyId?: string;
  lastReportAt?: Date;
}

async function saveHaitoDate(contextKey: string, haitoDate: string, sbUrl: string, sbKey: string) {
  await fetch(`${sbUrl}/rest/v1/line_context`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ context_key: contextKey, line_user_id: contextKey, haito_date: haitoDate, updated_at: new Date().toISOString() }),
  });
}

async function getStoredContext(contextKey: string, sbUrl: string, sbKey: string): Promise<LineContext | null> {
  const res = await fetch(
    `${sbUrl}/rest/v1/line_context?context_key=eq.${encodeURIComponent(contextKey)}&select=haito_date,updated_at,property_id,candidates,last_report_property_id,last_report_at`,
    { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
  );
  if (!res.ok) return null;
  const data: { haito_date: string; updated_at: string; property_id?: string | null; candidates?: string | null; last_report_property_id?: string | null; last_report_at?: string | null }[] = await res.json();
  if (!data[0]) return null;
  const updatedAt = new Date(data[0].updated_at);
  return {
    haitoDate: data[0].haito_date,
    updatedAt,
    propertyId: (Date.now() - updatedAt.getTime()) / 3600000 <= 24 ? data[0].property_id ?? undefined : undefined,
    candidates: data[0].candidates ? JSON.parse(data[0].candidates) : undefined,
    lastReportPropertyId: data[0].last_report_property_id ?? undefined,
    lastReportAt: data[0].last_report_at ? new Date(data[0].last_report_at) : undefined,
  };
}

async function patchContext(contextKey: string, patch: Record<string, unknown>, sbUrl: string, sbKey: string) {
  await fetch(`${sbUrl}/rest/v1/line_context`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ context_key: contextKey, line_user_id: contextKey, updated_at: new Date().toISOString(), ...patch }),
  });
}

async function clearAttachContext(contextKey: string, sbUrl: string, sbKey: string) {
  await fetch(
    `${sbUrl}/rest/v1/line_context?context_key=eq.${encodeURIComponent(contextKey)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
      body: JSON.stringify({ property_id: null, candidates: null }),
    }
  );
}

// 報告直後の写真を自動追従添付するため、直近登録先案件を記憶する
async function markLastReport(contextKey: string, propertyId: string, sbUrl: string, sbKey: string) {
  await patchContext(contextKey, { last_report_property_id: propertyId, last_report_at: new Date().toISOString() }, sbUrl, sbKey);
}

// ── 報告者マッピング（LINEユーザー → 担当者名） ──────────────────
async function getLineDisplayName(userId: string, token: string, groupId?: string | null): Promise<string | null> {
  const url = groupId
    ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
    : `https://api.line.me/v2/bot/profile/${userId}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.displayName ?? null;
  } catch {
    return null;
  }
}

async function getOrCreateReporter(userId: string, token: string, groupId: string | undefined, sbUrl: string, sbKey: string): Promise<{ displayName: string | null; assignee: string | null }> {
  const res = await fetch(
    `${sbUrl}/rest/v1/line_reporters?line_user_id=eq.${encodeURIComponent(userId)}&select=display_name,assignee`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  );
  const rows: { display_name: string | null; assignee: string | null }[] = res.ok ? await res.json() : [];
  if (rows[0]) return { displayName: rows[0].display_name, assignee: rows[0].assignee };

  const displayName = await getLineDisplayName(userId, token, groupId);
  await fetch(`${sbUrl}/rest/v1/line_reporters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}`, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ line_user_id: userId, display_name: displayName, assignee: null }),
  });
  return { displayName, assignee: null };
}

// ── 報告テキスト解析（Claude） ────────────────────────────────
interface ParsedReport {
  is_report: boolean;
  address?: string;
  owner_name?: string;
  case_shorthand?: string;
  visit_result?: '不在' | '対応済み' | '再訪問' | '対象外' | '要連絡' | null;
  memo?: string;
  next_action?: string;
  tasha_hata?: boolean; // 他社の旗あり
  reains_none?: boolean;
  vacancy_suspected?: boolean;
  document_hints?: string[];
}

function parseReportLocally(text: string): Partial<ParsedReport> {
  const normalized = text.normalize('NFKC');
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const caseRef = normalized.match(/(?:大阪|京都|神戸|尼崎|滋賀|奈良)\s*[ケヌ]\s*\d+/)?.[0]?.replace(/\s/g, '');
  const addressLine = lines.find((line) => /(?:市|区|町|村).*(?:丁目|番|号|\d)/.test(line) && !/不在|資料|レインズ/.test(line));
  const visitResult = /不在/.test(normalized) ? '不在'
    : /対象外/.test(normalized) ? '対象外'
    : /再訪/.test(normalized) ? '再訪問'
    : /面談|本人対応|応対|接触/.test(normalized) ? '対応済み'
    : null;
  const hints = [
    /登記/.test(normalized) ? '登記簿' : null,
    /物件目録|配当一覧/.test(normalized) ? '物件目録' : null,
    /図面|間取り/.test(normalized) ? '図面・間取り' : null,
    /媒介/.test(normalized) ? '媒介書類' : null,
    /他社資料/.test(normalized) ? '他社資料' : null,
  ].filter((value): value is string => Boolean(value));
  return {
    is_report: Boolean(caseRef || addressLine) && Boolean(visitResult || /レインズ|空き家|資料|電気/.test(normalized)),
    case_shorthand: caseRef,
    address: addressLine,
    visit_result: visitResult,
    reains_none: /レインズ\s*(?:なし|無し|無)/.test(normalized),
    vacancy_suspected: /空き家|空家|電気(?:が)?(?:ついて|点いて)?いない/.test(normalized),
    document_hints: hints,
  };
}

async function parseReportWithClaude(text: string): Promise<ParsedReport> {
  const local = parseReportLocally(text);
  try {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `以下は不動産営業の現地訪問報告のLINEメッセージかもしれません。JSON形式で解析してください。

メッセージ: "${text}"

出力形式（JSONのみ、他のテキストは含めない）:
{
  "is_report": true/false,
  "address": "住所（記載があれば）",
  "owner_name": "所有者・お客様氏名（記載があれば）",
  "case_shorthand": "事件番号。大阪ヌ127・尼崎ケ30のような裁判所付き短縮形はそのまま保持。令和8年(ヌ)第4号 → 8ヌ4",
  "visit_result": "不在" | "対応済み" | "再訪問" | "対象外" | "要連絡" | null,
  "memo": "報告内容の要約（現地の状況）",
  "next_action": "次のアクション（記載があれば）",
  "tasha_hata": true/false（「他社の旗」「競合の看板」等の記載があればtrue）
}

is_report は、雑談・業務連絡・スタンプへの反応など訪問報告でない場合は false にしてください。`,
    }],
  });
  const textOut = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
  const match = textOut.match(/\{[\s\S]*\}/);
  if (!match) return { is_report: false };
  try {
    const ai = JSON.parse(match[0]) as ParsedReport;
    return {
      ...ai,
      is_report: ai.is_report || Boolean(local.is_report),
      case_shorthand: local.case_shorthand || ai.case_shorthand,
      address: ai.address || local.address,
      visit_result: ai.visit_result || local.visit_result,
      reains_none: local.reains_none,
      vacancy_suspected: local.vacancy_suspected,
      document_hints: local.document_hints,
    };
  } catch {
    return { is_report: Boolean(local.is_report), ...local } as ParsedReport;
  }
  } catch (e: any) {
    // APIクレジット切れ等でClaude解析が失敗しても報告を取りこぼさない（ローカル解析で継続）
    console.error('Claude parse failed, using local fallback:', e?.message);
    return { ...local, is_report: Boolean(local.is_report), memo: text } as ParsedReport;
  }
}

// ── 報告 → 案件マッチング ────────────────────────────────────
interface PropertyRow {
  id: string;
  owner_name: string;
  address: string;
  case_number: string | null;
  status: string;
  assignee: string | null;
  notes: string | null;
}

async function matchReportToProperty(parsed: ParsedReport, sbUrl: string, sbKey: string): Promise<PropertyRow[]> {
  // ①事件番号（最優先・確度が高い）
  if (parsed.case_shorthand) {
    const directKey = normalizeCaseReference(parsed.case_shorthand);
    const key = caseKeyFromShorthand(parsed.case_shorthand);
    if (key) {
      const res = await fetch(
        `${sbUrl}/rest/v1/properties?select=id,owner_name,address,case_number,status,assignee,notes&order=updated_at.desc&limit=200`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      );
      const rows: PropertyRow[] = res.ok ? await res.json() : [];
      const hit = rows.filter((r) => caseKeyFromTitle(r.case_number) === key || (directKey && normalizeCaseReference(r.case_number) === directKey));
      if (hit.length) return hit;
    }
    if (directKey) {
      const res = await fetch(
        `${sbUrl}/rest/v1/properties?select=id,owner_name,address,case_number,status,assignee,notes&order=updated_at.desc&limit=500`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      );
      const rows: PropertyRow[] = res.ok ? await res.json() : [];
      const hit = rows.filter((r) => normalizeCaseReference(r.case_number) === directKey);
      if (hit.length) return hit;
    }
  }
  // ②住所（正規化して前方一致）
  if (parsed.address) {
    const na = normalizeAddress(parsed.address);
    if (na.length >= 6) {
      const res = await fetch(
        `${sbUrl}/rest/v1/properties?select=id,owner_name,address,case_number,status,assignee,notes&order=updated_at.desc&limit=500`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      );
      const rows: PropertyRow[] = res.ok ? await res.json() : [];
      const hit = rows.filter((r) => {
        const ra = normalizeAddress(r.address);
        return ra && (ra.startsWith(na) || na.startsWith(ra));
      });
      if (hit.length) return hit;
    }
  }
  // ③所有者名（部分一致）
  if (parsed.owner_name) {
    const q = encodeURIComponent(parsed.owner_name);
    const res = await fetch(
      `${sbUrl}/rest/v1/properties?owner_name=ilike.*${q}*&select=id,owner_name,address,case_number,status,assignee,notes&order=updated_at.desc&limit=5`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (res.ok) {
      const rows: PropertyRow[] = await res.json();
      if (rows.length) return rows;
    }
  }
  return [];
}

const RESULT_JUDGMENT: Record<string, '○' | '△' | '✖'> = {
  '対応済み': '○', '要連絡': '○',
  '再訪問': '△', '不在': '△',
  '対象外': '✖',
};

// 報告内容から案件を更新（訪問記録追加・ステータス/担当・備考の安全な更新）
async function applyReportToProperty(
  prop: PropertyRow,
  parsed: ParsedReport,
  reporterName: string,
  assignee: string | null,
  sbUrl: string,
  sbKey: string,
) {
  // 訪問記録を追加（既存記録は上書きしない）
  await fetch(`${sbUrl}/rest/v1/visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    body: JSON.stringify({
      property_id: prop.id,
      contact_type: 'LINE報告',
      summary: parsed.memo ?? null,
      judgment: parsed.visit_result ? RESULT_JUDGMENT[parsed.visit_result] ?? null : null,
      next_action: parsed.next_action ?? null,
      recorded_by: reporterName,
    }),
  });

  // ステータスは安全な方向にのみ自動遷移させる
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.tasha_hata) {
    patch.status = '訪問対象外';
  } else if (parsed.visit_result === '対象外') {
    patch.status = '訪問対象外';
  } else if (prop.status === '未訪問' && parsed.visit_result) {
    patch.status = '訪問対象';
  }
  if (!prop.assignee && assignee) {
    patch.assignee = assignee;
  }
  if (parsed.memo) {
    const stamp = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    const line = `${stamp} ${reporterName}: ${parsed.memo}`;
    patch.notes = prop.notes ? `${line}\n${prop.notes}` : line;
  }
  const flags = [
    parsed.reains_none ? 'レインズなし' : null,
    parsed.vacancy_suspected ? '空き家の可能性' : null,
    parsed.document_hints?.length ? `資料: ${parsed.document_hints.join('・')}` : null,
  ].filter(Boolean).join(' / ');
  if (flags && !String(patch.notes ?? prop.notes ?? '').includes(flags)) {
    patch.notes = `${flags}\n${String(patch.notes ?? prop.notes ?? '')}`.trim();
  }
  await fetch(`${sbUrl}/rest/v1/properties?id=eq.${prop.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    body: JSON.stringify(patch),
  });
  try {
    await updateNotionCaseFromLine({
      address: prop.address,
      caseNumber: prop.case_number,
      visitResult: parsed.visit_result ?? null,
      memo: parsed.memo ?? (flags || null),
      nextAction: parsed.next_action ?? (parsed.visit_result === '不在' ? '時間帯を変えて再訪' : null),
      reainsNone: Boolean(parsed.reains_none),
      vacancySuspected: Boolean(parsed.vacancy_suspected),
    });
  } catch (e: any) {
    console.error('Notion LINE update failed:', e?.message);
  }
}

async function logReport(
  groupId: string | undefined,
  lineUserId: string,
  rawText: string,
  parsed: ParsedReport | null,
  propertyId: string | null,
  status: 'processed' | 'unmatched' | 'ignored',
  sbUrl: string,
  sbKey: string,
) {
  await fetch(`${sbUrl}/rest/v1/line_reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    body: JSON.stringify({
      group_id: groupId ?? null,
      line_user_id: lineUserId,
      raw_text: rawText,
      parsed: parsed ?? null,
      property_id: propertyId,
      status,
    }),
  });
}


// ── 転送・新規案件フロー支援 ──────────────────────────────────

// ファイル名から資料カテゴリを推定
function guessFileCategory(fileName: string): string {
  if (/登記/.test(fileName)) return '登記簿';
  if (/目録|配当一覧/.test(fileName)) return '物件目録';
  if (/間取り|図面/.test(fileName)) return '図面・間取り';
  if (/媒介/.test(fileName)) return '媒介書類';
  if (/弁護士|債権者/.test(fileName)) return '重要書類';
  return 'その他';
}

// ファイル名の住所・法人名から案件を特定（登記簿PDFの自動紐付け）
async function matchFileNameToProperty(fileName: string, sbUrl: string, sbKey: string): Promise<PropertyRow | null> {
  const base = fileName.normalize('NFKC');
  const res = await fetch(
    `${sbUrl}/rest/v1/properties?select=id,owner_name,address,case_number,status,assignee,notes&order=updated_at.desc&limit=500`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  );
  if (!res.ok) return null;
  const rows: PropertyRow[] = await res.json();

  // 不動産登記: ファイル名先頭の住所でマッチ
  const m = base.match(/^(.+?)不動産登記/);
  if (m) {
    const fa = normalizeAddress(m[1]).replace(/[−－ー]/g, '-');
    if (fa.length >= 6) {
      for (const r of rows) {
        const ra = normalizeAddress(r.address).replace(/番地の?|番(?=\d)/g, '-').replace(/[−－ー]/g, '-');
        const fb = fa.replace(/番地の?|番(?=\d)/g, '-');
        if (ra && (ra.startsWith(fb) || fb.startsWith(ra) || (fb.length >= 8 && ra.includes(fb.slice(0, 12))))) return r;
      }
    }
  }
  // 法人登記簿: 法人名で所有者マッチ
  const corp = base.match(/^(.+?)法人登記簿/);
  if (corp) {
    const cname = corp[1].replace(/[\s　]/g, '');
    for (const r of rows) {
      const on = (r.owner_name || '').normalize('NFKC').replace(/[\s　]/g, '');
      if (cname && on && (on.includes(cname) || cname.includes(on))) return r;
    }
  }
  return null;
}

// 報告より先に届いた保留画像を案件へ添付
async function attachPendingImages(contextKey: string, propertyId: string, sbUrl: string, sbKey: string): Promise<number> {
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const res = await fetch(
    `${sbUrl}/rest/v1/line_pending_images?context_key=eq.${encodeURIComponent(contextKey)}&created_at=gte.${since}&select=id,file_path,file_name,file_size`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  );
  if (!res.ok) return 0;
  const rows: { id: string; file_path: string; file_name: string; file_size: number | null }[] = await res.json();
  let attached = 0;
  for (const r of rows) {
    const ins = await fetch(`${sbUrl}/rest/v1/case_files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      body: JSON.stringify({
        property_id: propertyId, file_name: r.file_name, file_path: r.file_path,
        file_type: 'jpeg', file_size: r.file_size, category: '写真',
      }),
    });
    if (ins.ok) {
      attached++;
      await fetch(`${sbUrl}/rest/v1/line_pending_images?id=eq.${r.id}`, {
        method: 'DELETE',
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      });
    }
  }
  return attached;
}

// 該当案件が無い報告から新規案件を自動登録（配当転送フロー対応）
async function registerNewCaseFromReport(
  parsed: ParsedReport,
  reporterName: string,
  assignee: string | null,
  sbUrl: string,
  sbKey: string,
): Promise<PropertyRow | null> {
  if (!parsed.address) return null;
  const address = parsed.address.normalize('NFKC');
  let status = '未訪問';
  if (parsed.tasha_hata || parsed.visit_result === '対象外') status = '訪問対象外';
  else if (parsed.visit_result) status = '訪問対象';

  const stamp = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  const notes = parsed.memo ? `${stamp} ${reporterName}: ${parsed.memo}` : null;

  const res = await fetch(`${sbUrl}/rest/v1/properties`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      address,
      owner_name: parsed.owner_name || '',
      status, rank: 'C', category: '任意売却',
      assignee: assignee ?? null,
      notes,
    }),
  });
  if (!res.ok) return null;
  const rows: PropertyRow[] = await res.json();
  const prop = rows[0];
  if (!prop) return null;

  if (parsed.visit_result || parsed.memo) {
    await fetch(`${sbUrl}/rest/v1/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      body: JSON.stringify({
        property_id: prop.id,
        contact_type: 'LINE報告',
        summary: parsed.memo ?? null,
        judgment: parsed.visit_result ? RESULT_JUDGMENT[parsed.visit_result] ?? null : null,
        next_action: parsed.next_action ?? null,
        recorded_by: reporterName,
      }),
    });
  }
  autoGeocode(1).catch(() => {});
  try {
    await createNotionCase({ address, ownerName: parsed.owner_name || '', caseNumber: null, haitoDate: null, notes: parsed.memo ?? null });
  } catch (e: any) {
    console.error('Notion sync failed:', e?.message);
  }
  return prop;
}
// 直近バッチの配当日を一括修正
async function fixRecentBatch(contextKey: string, newDate: string, sbUrl: string, sbKey: string): Promise<number> {
  const ctx = await getStoredContext(contextKey, sbUrl, sbKey);
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

// ── 案件検索 ─────────────────────────────────────────────────

// "8ヌ4" → LIKE パターン "*8*ヌ*4*"（令和8年(ヌ)第4号 にマッチ）
function parseCaseShorthand(keyword: string): string | null {
  const m = keyword.match(/^(\d+)([ァ-ン]+)(\d+)$/);
  if (!m) return null;
  return `*${m[1]}*${m[2]}*${m[3]}*`;
}

async function searchProperties(
  keyword: string | null,
  sbUrl: string,
  sbKey: string
): Promise<{ id: string; owner_name: string; address: string; case_number: string | null }[]> {
  let url: string;
  if (keyword) {
    const shorthand = parseCaseShorthand(keyword);
    if (shorthand) {
      // 短縮形（8ヌ4）→ 事件番号のみで検索
      url = `${sbUrl}/rest/v1/properties?case_number=ilike.${shorthand}&select=id,owner_name,address,case_number&order=updated_at.desc&limit=5`;
    } else {
      // 氏名・住所・事件番号で部分一致検索
      const q = encodeURIComponent(keyword);
      url = `${sbUrl}/rest/v1/properties?or=(owner_name.ilike.*${q}*,address.ilike.*${q}*,case_number.ilike.*${q}*)&select=id,owner_name,address,case_number&order=updated_at.desc&limit=5`;
    }
  } else {
    // キーワードなし → 最近更新された5件
    url = `${sbUrl}/rest/v1/properties?select=id,owner_name,address,case_number&order=updated_at.desc&limit=5`;
  }
  const res = await fetch(url, { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } });
  if (!res.ok) return [];
  return res.json();
}

// ── 案件ファイル添付 ──────────────────────────────────────────
async function uploadCaseFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  propertyId: string,
  category: string = 'その他',
): Promise<boolean> {
  const admin = createAdminClient();
  const storagePath = `${propertyId}/${Date.now()}_${fileName}`;
  const { error: storageError } = await admin.storage
    .from('case-files')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (storageError) { console.error('Storage error:', storageError.message); return false; }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const fileType = ext === 'pdf' ? 'pdf' : 'jpeg';
  const { error: dbError } = await admin.from('case_files').insert({
    property_id: propertyId,
    file_name: fileName,
    file_path: storagePath,
    file_type: fileType,
    file_size: buffer.length,
    category,
  });
  if (dbError) {
    await admin.storage.from('case-files').remove([storagePath]);
    console.error('DB error:', dbError.message);
    return false;
  }
  return true;
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
    model: 'claude-haiku-4-5',
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

function candidateListText(candidates: { id: string; name: string; address: string }[]): string {
  return candidates
    .map((c, i) => `${i + 1}. ${c.name}\n   ${c.address}`)
    .join('\n\n');
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
    const groupId: string | undefined = event.source?.type === 'group' ? event.source.groupId : undefined;
    const contextKey = contextKeyOf(lineUserId, groupId);

    // ── テキストメッセージ ──────────────────────────────────
    if (message.type === 'text') {
      const text: string = message.text.trim();

      // 「1」〜「5」の数字 → 候補から選択
      if (/^[1-5]$/.test(text)) {
        const ctx = await getStoredContext(contextKey, sbUrl, sbKey);
        if (ctx?.candidates && ctx.candidates.length > 0) {
          const idx = parseInt(text, 10) - 1;
          const chosen = ctx.candidates[idx];
          if (chosen) {
            await patchContext(contextKey, { property_id: chosen.id, candidates: null }, sbUrl, sbKey);
            await replyLine(
              replyToken,
              `📎 添付モード\n案件：${chosen.name}\n住所：${chosen.address}\n\n次に送った画像・PDFがこの案件に資料として追加されます。`,
              token
            );
          } else {
            await replyLine(replyToken, `⚠️ ${text} は選択肢にありません。`, token);
          }
          continue;
        }
      }

      // 「添付」または「添付 キーワード」
      if (text.startsWith('添付')) {
        const keyword = text.replace(/^添付\s*/, '').trim() || null;
        const results = await searchProperties(keyword, sbUrl, sbKey);

        if (results.length === 0) {
          const msg = keyword
            ? `⚠️ 「${keyword}」に一致する案件が見つかりませんでした。\n別のキーワードで試してください。`
            : '⚠️ 案件が見つかりませんでした。';
          await replyLine(replyToken, msg, token);
          continue;
        }

        if (results.length === 1) {
          const prop = results[0];
          await patchContext(contextKey, { property_id: prop.id, candidates: null }, sbUrl, sbKey);
          await replyLine(
            replyToken,
            `📎 添付モード\n案件：${prop.owner_name}\n住所：${prop.address}\n\n次に送った画像・PDFがこの案件に資料として追加されます。`,
            token
          );
          continue;
        }

        // 複数ヒット → 番号リスト表示
        const candidates = results.map((r) => ({ id: r.id, name: r.owner_name, address: r.address }));
        await patchContext(contextKey, { candidates: JSON.stringify(candidates), property_id: null }, sbUrl, sbKey);
        const listText = candidateListText(candidates);
        const header = keyword ? `「${keyword}」の検索結果（${results.length}件）` : `最近の案件（${results.length}件）`;
        await replyLine(
          replyToken,
          `📎 ${header}\n\n${listText}\n\n番号を送ると添付先に設定されます。`,
          token
        );
        continue;
      }

      // 「配当日修正 YYYY-MM-DD」
      if (text.includes('修正')) {
        const newDate = extractDate(text);
        if (newDate) {
          const count = await fixRecentBatch(contextKey, newDate, sbUrl, sbKey);
          await saveHaitoDate(contextKey, newDate, sbUrl, sbKey);
          await replyLine(
            replyToken,
            count > 0
              ? `✅ ${count}件の配当日を ${newDate} に修正しました。`
              : `⚠️ 修正対象が見つかりませんでした。`,
            token
          );
          continue;
        }
      }

      // 日付のみ → 配当日を設定（数字/事件番号/日付以外はテキストとして続く報告解析に回る）
      const dateStr = /^\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}日?$/.test(text) ? extractDate(text) : null;
      if (dateStr) {
        await saveHaitoDate(contextKey, dateStr, sbUrl, sbKey);
        await replyLine(
          replyToken,
          `📅 配当日を ${dateStr} に設定しました。\n次に送った画像にこの日付が使われます。\n※24時間で自動リセットされます。\n\n日付を間違えた場合：「修正 YYYY-MM-DD」と送ってください。`,
          token
        );
        continue;
      }

      // 現地訪問報告として解析を試みる（雑談・業務連絡は is_report:false で無視）
      try {
        const parsed = await parseReportWithClaude(text);
        if (parsed.is_report) {
          const reporter = await getOrCreateReporter(lineUserId, token, groupId, sbUrl, sbKey);
          const reporterName = reporter.displayName ?? '不明';
          const candidates = await matchReportToProperty(parsed, sbUrl, sbKey);

          if (candidates.length === 1) {
            const prop = candidates[0];
            await applyReportToProperty(prop, parsed, reporterName, reporter.assignee, sbUrl, sbKey);
            await markLastReport(contextKey, prop.id, sbUrl, sbKey);
            const attached = await attachPendingImages(contextKey, prop.id, sbUrl, sbKey);
            await logReport(groupId, lineUserId, text, parsed, prop.id, 'processed', sbUrl, sbKey);
            await replyLine(replyToken, `✅ ${prop.owner_name}様（${prop.address}）に記録しました${attached ? `\n📷 写真${attached}枚も添付しました` : ''}`, token);
            continue;
          }

          if (candidates.length > 1) {
            const listCandidates = candidates.slice(0, 5).map((r) => ({ id: r.id, name: r.owner_name, address: r.address }));
            await patchContext(contextKey, { candidates: JSON.stringify(listCandidates), property_id: null }, sbUrl, sbKey);
            await replyLine(
              replyToken,
              `📎 案件を特定できませんでした。該当しそうな案件（${listCandidates.length}件）\n\n${candidateListText(listCandidates)}\n\n番号を送ると選択できます。`,
              token
            );
            await logReport(groupId, lineUserId, text, parsed, null, 'unmatched', sbUrl, sbKey);
            continue;
          }

          // 0件 → 住所が読み取れていれば新規案件として自動登録（配当転送フロー対応）
          if (parsed.address) {
            const created = await registerNewCaseFromReport(parsed, reporterName, reporter.assignee, sbUrl, sbKey);
            if (created) {
              await markLastReport(contextKey, created.id, sbUrl, sbKey);
              const attached = await attachPendingImages(contextKey, created.id, sbUrl, sbKey);
              await logReport(groupId, lineUserId, text, parsed, created.id, 'processed', sbUrl, sbKey);
              await replyLine(
                replyToken,
                `🆕 新規案件として登録しました\n${created.owner_name ? created.owner_name + '\n' : ''}${created.address}${attached ? `\n📷 写真${attached}枚も添付しました` : ''}`,
                token
              );
              continue;
            }
          }
          // 住所も無い → 未処理として記録し、アプリの一覧から後で手動紐付けできるようにする
          await logReport(groupId, lineUserId, text, parsed, null, 'unmatched', sbUrl, sbKey);
          await replyLine(replyToken, '📝 報告を受け取りましたが、該当する案件を特定できませんでした。\nアプリの「未処理報告」から手動で紐付けできます。', token);
          continue;
        }
      } catch (err: any) {
        console.error('Report parse error:', err?.message);
        // 解析エラー時はヘルプにフォールバック
      }

      // ヘルプ
      await replyLine(
        replyToken,
        '競売物件リストの画像を送ってください。\nOCRで物件情報を解析します。\n\n📅 配当日設定：日付を送る\n例：2026-06-30\n\n📎 資料を案件に添付：\n「添付」→ 最近の案件リスト\n「添付 田中」→ 氏名/住所で検索\n→ 番号を返信して選択\n→ 画像・PDFを送る\n\n🔧 日付修正：「修正 2026-07-31」',
        token
      );
      continue;
    }

    // ── 画像 ────────────────────────────────────────────────
    if (message.type === 'image') {
      try {
        const { buffer, mimeType } = await getLineContent(message.id, token);
        const ctx = await getStoredContext(contextKey, sbUrl, sbKey);

        // 添付モード（「添付」コマンドで明示的に指定した案件）
        if (ctx?.propertyId) {
          const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
          const fileName = `LINE_${Date.now()}.${ext}`;
          const ok = await uploadCaseFile(buffer, mimeType, fileName, ctx.propertyId, '写真');
          await clearAttachContext(contextKey, sbUrl, sbKey);
          await replyLine(replyToken, ok ? '✅ 画像を案件の資料に追加しました。' : '⚠️ ファイルの保存に失敗しました。', token);
          continue;
        }

        // 報告直後（15分以内）の写真は自動で同じ案件に追従添付する
        if (ctx?.lastReportPropertyId && ctx.lastReportAt && (Date.now() - ctx.lastReportAt.getTime()) / 60000 <= 15) {
          const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
          const fileName = `LINE_${Date.now()}.${ext}`;
          const ok = await uploadCaseFile(buffer, mimeType, fileName, ctx.lastReportPropertyId, '写真');
          if (ok) {
            await markLastReport(contextKey, ctx.lastReportPropertyId, sbUrl, sbKey); // 15分カウントを延長
            continue; // 報告フローの写真は毎回返信しない（グループを騒がせない）
          }
        }

        // OCRモード
        const sendDate = new Date(event.timestamp).toISOString().split('T')[0];
        const usedHaitoDate = ctx?.haitoDate ?? sendDate;
        const properties = await ocrWithClaude(buffer, mimeType);

        if (properties.length === 0) {
          // 現地写真の可能性が高い → 保留バッファに保存し、続く報告で案件が確定したら自動添付する
          const admin = createAdminClient();
          const ext = mimeType === 'image/png' ? 'png' : 'jpg';
          const pendingName = `LINE_${Date.now()}.${ext}`;
          const pendingPath = `pending/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: pe } = await admin.storage.from('case-files').upload(pendingPath, buffer, { contentType: mimeType, upsert: false });
          if (!pe) {
            await fetch(`${sbUrl}/rest/v1/line_pending_images`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: sbKey, Authorization: `Bearer ${sbKey}` },
              body: JSON.stringify({ context_key: contextKey, file_path: pendingPath, file_name: pendingName, file_size: buffer.length }),
            });
            // グループを騒がせないため返信しない（続く報告テキストで自動添付される）
            continue;
          }
          await replyLine(replyToken, '物件情報を抽出できませんでした。\n\n📎 資料を案件に添付したい場合は「添付」と送ってください。', token);
          continue;
        }

        const valid = properties.filter((p) => p.address);
        const caseNumbers = valid.map((p) => p.case_number).filter(Boolean) as string[];
        let existingMap: Record<string, string> = {};
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
            await fetch(`${sbUrl}/rest/v1/properties?id=eq.${existingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
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
          if (!insertRes.ok) throw new Error(`Insert failed: ${insertRes.status} ${await insertRes.text()}`);
          const inserted: { id: string }[] = await insertRes.json();
          insertedCount = inserted.length;

          // Notion案件DBへも自動登録（アプリ登録が主・Notionは失敗しても続行）
          for (const row of toInsert as any[]) {
            try {
              const r = await createNotionCase({
                address: row.address,
                ownerName: row.owner_name,
                caseNumber: row.case_number,
                haitoDate: row.haito_date,
                notes: row.notes,
              });
              console.log('Notion sync:', r, row.address?.slice(0, 20));
            } catch (e: any) {
              console.error('Notion sync failed:', e?.message);
            }
          }
        }
        autoGeocode(3).catch(() => {});
        await saveHaitoDate(contextKey, usedHaitoDate, sbUrl, sbKey);

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
        console.error('Image handler error:', err?.message, err?.stack);
        await replyLine(replyToken, `⚠️ エラーが発生しました\n${String(err?.message ?? err).slice(0, 200)}`, token);
      }
    }

    // ── PDFファイル ─────────────────────────────────────────
    if (message.type === 'file') {
      try {
        const ctx = await getStoredContext(contextKey, sbUrl, sbKey);
        const fileName = (message.fileName as string | undefined) ?? `LINE_${Date.now()}.pdf`;

        // ①添付モード（明示指定）
        if (ctx?.propertyId) {
          const { buffer, mimeType } = await getLineContent(message.id, token);
          const ok = await uploadCaseFile(buffer, mimeType || 'application/pdf', fileName, ctx.propertyId, guessFileCategory(fileName));
          await clearAttachContext(contextKey, sbUrl, sbKey);
          await replyLine(replyToken, ok ? `✅ ${fileName} を案件の資料に追加しました。` : '⚠️ ファイルの保存に失敗しました。', token);
          continue;
        }

        // ②ファイル名の住所・法人名から案件を自動特定（登記簿PDFの転送に対応）
        const byName = await matchFileNameToProperty(fileName, sbUrl, sbKey);
        if (byName) {
          const { buffer, mimeType } = await getLineContent(message.id, token);
          const category = guessFileCategory(fileName);
          const ok = await uploadCaseFile(buffer, mimeType || 'application/pdf', fileName, byName.id, category);
          await replyLine(replyToken, ok ? `📜 ${byName.owner_name || byName.address}の「${category}」に追加しました` : '⚠️ ファイルの保存に失敗しました。', token);
          continue;
        }

        // ③直近15分以内に報告した案件へ自動添付
        if (ctx?.lastReportPropertyId && ctx.lastReportAt && (Date.now() - ctx.lastReportAt.getTime()) / 60000 <= 15) {
          const { buffer, mimeType } = await getLineContent(message.id, token);
          const category = guessFileCategory(fileName);
          const ok = await uploadCaseFile(buffer, mimeType || 'application/pdf', fileName, ctx.lastReportPropertyId, category);
          if (ok) {
            await markLastReport(contextKey, ctx.lastReportPropertyId, sbUrl, sbKey);
            await replyLine(replyToken, `📜 直前の案件の「${category}」に追加しました`, token);
            continue;
          }
        }

        await replyLine(replyToken, '📎 添付先の案件を特定できませんでした。「添付 氏名や住所」と送って案件を選んでから、もう一度ファイルを送ってください。', token);
      } catch (err: any) {
        console.error('File handler error:', err?.message);
        await replyLine(replyToken, `⚠️ エラー: ${String(err?.message ?? err).slice(0, 100)}`, token);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
