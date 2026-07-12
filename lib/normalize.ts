// 住所・事件番号の表記ゆらぎ吸収（LINE報告解析・Notion同期などで共用）

const PREFS = ['京都府', '大阪府', '兵庫県', '滋賀県', '奈良県'];
const KANJI: Record<string, string> = {
  '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
  '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
};

export function normalizeAddress(a: string | null | undefined): string {
  if (!a) return '';
  let s = a.normalize('NFKC');
  s = s.replace(/^(大阪|京都|神戸|尼崎|滋賀|奈良|兵庫)\s+/, '');
  s = s.replace(/[（(][^（）()]*[）)]/g, '');
  s = s.replace(/[\s、,・\n]/g, '');
  for (const p of PREFS) {
    if (s.startsWith(p)) { s = s.slice(p.length); break; }
  }
  s = s.replace(/([一二三四五六七八九十])丁目/g, (_, k: string) => KANJI[k] + '丁目');
  s = s.replace(/ケ/g, 'ヶ').replace(/番地/g, '番');
  return s;
}

// "8ヌ4" 形式の事件番号短縮形を「令和8年（ヌ）第4号」の正規キーに変換
export function caseKeyFromShorthand(keyword: string): string | null {
  const m = keyword.match(/^(\d+)([ァ-ン]+)(\d+)$/);
  if (!m) return null;
  return `R${m[1]}-${m[2]}-${m[3]}`;
}

export function caseKeyFromTitle(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.normalize('NFKC');
  const m = s.match(/令和(\d+)年.{0,12}?[（(](ケ|ヌ)[）)]\s*第(\d+)号/);
  return m ? `R${m[1]}-${m[2]}-${m[3]}` : null;
}

// 「大阪ヌ127」「尼崎ケ30」「令和8年(ヌ)第4号」などを比較用キーへ変換する。
// 裁判所名だけの短縮形には年度が無いため、年度付きキーとは分けて安全に照合する。
export function normalizeCaseReference(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.normalize('NFKC').replace(/[\s　()（）第号年]/g, '');
  const full = s.match(/令和(\d+)(ケ|ヌ)(\d+)/);
  if (full) return `R${full[1]}-${full[2]}-${full[3]}`;
  const court = s.match(/(大阪|京都|神戸|尼崎|滋賀|奈良)(ケ|ヌ)(\d+)/);
  if (court) return `${court[1]}-${court[2]}-${court[3]}`;
  const short = s.match(/^(\d+)(ケ|ヌ)(\d+)$/);
  if (short) return `R${short[1]}-${short[2]}-${short[3]}`;
  return null;
}
