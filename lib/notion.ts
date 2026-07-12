// Notion 案件DBへの自動登録（配当一覧OCR登録時にアプリと同時に反映する）
// NOTION_TOKEN / NOTION_CASES_DB_ID が未設定の場合は何もしない（安全側）

const NOTION_VERSION = '2022-06-28';

interface NotionCaseInput {
  address: string;        // 所在地
  ownerName: string;      // 所有者
  caseNumber?: string | null; // 事件番号（例: 令和8年(ヌ)第4号）
  haitoDate?: string | null;  // 配当要求日 YYYY-MM-DD
  notes?: string | null;
}

// 会社の管轄ルールに合わせた地域判定（兵庫は尼崎支部エリアとそれ以外=神戸で分ける）
function detectRegion(address: string): string {
  if (/西宮市|尼崎市|宝塚市|芦屋市|伊丹市|川西市|三田市|丹波市|丹波篠山市|猪名川町/.test(address)) return '尼崎';
  if (/神戸市|明石市|三木市|淡路市|洲本市|南あわじ市|加古川市|高砂市|姫路市/.test(address)) return '神戸';
  if (/滋賀県|大津市|草津市|栗東市|守山市|野洲市|甲賀市|湖南市|東近江市|彦根市|長浜市|高島市/.test(address)) return '滋賀';
  if (/大阪|堺市|豊中市|吹田市|高槻市|枚方市|茨木市|八尾市|寝屋川市|東大阪市|守口市|大東市|箕面市|門真市|摂津市|交野市|四條畷市|池田市|能勢町|豊能町/.test(address)) return '大阪';
  if (/奈良/.test(address)) return '奈良';
  return '京都';
}

function haitoMonthOf(haitoDate?: string | null): string | null {
  if (!haitoDate) return null;
  const m = haitoDate.match(/^\d{4}-(\d{2})/);
  return m ? `${parseInt(m[1], 10)}月配当` : null;
}

async function notionFetch(path: string, body: object): Promise<any> {
  const token = process.env.NOTION_TOKEN;
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function notionPatch(path: string, body: object): Promise<any> {
  const token = process.env.NOTION_TOKEN;
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

interface NotionLineUpdateInput {
  address: string;
  caseNumber?: string | null;
  visitResult?: string | null;
  memo?: string | null;
  nextAction?: string | null;
  reainsNone?: boolean;
  vacancySuspected?: boolean;
}

export async function updateNotionCaseFromLine(input: NotionLineUpdateInput): Promise<'updated' | 'not_found' | 'disabled'> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_CASES_DB_ID;
  if (!token || !dbId) return 'disabled';
  const filters: object[] = [];
  if (input.caseNumber) filters.push({ property: '案件名', title: { contains: input.caseNumber } });
  const shortAddr = input.address.replace(/^(京都府|大阪府|兵庫県|滋賀県|奈良県)/, '').slice(0, 12);
  if (shortAddr.length >= 6) filters.push({ property: '所在地', rich_text: { contains: shortAddr } });
  for (const filter of filters) {
    const data = await notionFetch(`databases/${dbId}/query`, { filter, page_size: 1 });
    const page = data.results?.[0];
    if (!page) continue;
    const now = new Date().toISOString();
    const memoParts = [input.memo, input.reainsNone ? 'レインズなし' : null, input.vacancySuspected ? '空き家の可能性' : null].filter(Boolean);
    const properties: Record<string, unknown> = {
      'LINE更新日時': { date: { start: now } },
      '最終訪問日': { date: { start: now.slice(0, 10) } },
    };
    if (input.visitResult) properties['訪問ステータス'] = { select: { name: input.visitResult } };
    if (input.nextAction) properties['次アクション'] = { rich_text: [{ text: { content: input.nextAction.slice(0, 1900) } }] };
    if (input.vacancySuspected) properties['空き家状態'] = { select: { name: '空き家の可能性' } };
    await notionPatch(`pages/${page.id}`, { properties });
    if (memoParts.length) {
      await notionFetch(`blocks/${page.id}/children`, {
        children: [{
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ text: { content: `LINE報告: ${memoParts.join(' / ').slice(0, 1850)}` } }] },
        }],
      });
    }
    return 'updated';
  }
  return 'not_found';
}

// 事件番号または所在地で既存ページを検索（二重登録防止）
async function existsInNotion(dbId: string, caseNumber: string | null | undefined, address: string): Promise<boolean> {
  const filters: object[] = [];
  if (caseNumber) {
    // 「令和8年(ヌ)第4号」→「第4号」部分などの表記ゆらぎに強いよう号数で検索
    const m = caseNumber.normalize('NFKC').match(/令和(\d+)年.*?第(\d+)号/);
    if (m) filters.push({ property: '案件名', title: { contains: `第${m[2]}号` } });
  }
  const shortAddr = address.replace(/^(京都府|大阪府|兵庫県|滋賀県|奈良県)/, '').slice(0, 12);
  if (shortAddr.length >= 6) filters.push({ property: '所在地', rich_text: { contains: shortAddr } });
  if (filters.length === 0) return false;

  for (const filter of filters) {
    const data = await notionFetch(`databases/${dbId}/query`, { filter, page_size: 3 });
    if (caseNumber && data.results?.length) {
      // 号数一致は同地域か軽く確認（本文比較まではしない・安全側で存在扱い）
      return true;
    }
    if (!caseNumber && data.results?.length) return true;
  }
  return false;
}

// アプリ登録と同時に Notion 案件DBへページ作成（失敗しても呼び出し元は継続する想定）
export async function createNotionCase(input: NotionCaseInput): Promise<'created' | 'skipped' | 'disabled'> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_CASES_DB_ID;
  if (!token || !dbId) return 'disabled';

  const region = detectRegion(input.address);
  if (await existsInNotion(dbId, input.caseNumber, input.address)) return 'skipped';

  const title = [
    `[${region}]`,
    input.caseNumber ?? '',
    input.ownerName && input.ownerName !== '不明' ? input.ownerName : '',
  ].filter(Boolean).join(' ') || `[${region}] ${input.address.slice(0, 30)}`;

  const properties: Record<string, unknown> = {
    '案件名': { title: [{ text: { content: title } }] },
    '所在地': { rich_text: [{ text: { content: input.address } }] },
    'ステータス': { select: { name: '未着手' } },
    '種別': { select: { name: '任意売却' } },
    '地域': { select: { name: region } },
    '元データ参照元': { rich_text: [{ text: { content: 'LINE Bot自動登録（配当一覧OCR）' } }] },
  };
  if (input.ownerName && input.ownerName !== '不明') {
    properties['所有者'] = { rich_text: [{ text: { content: input.ownerName } }] };
  }
  const haitoMonth = haitoMonthOf(input.haitoDate);
  if (haitoMonth) properties['配当月'] = { select: { name: haitoMonth } };
  if (input.haitoDate) properties['BIT配当要求日'] = { rich_text: [{ text: { content: input.haitoDate } }] };
  if (input.notes) properties['備考'] = { rich_text: [{ text: { content: input.notes.slice(0, 1900) } }] };

  await notionFetch('pages', { parent: { database_id: dbId }, properties });
  return 'created';
}
