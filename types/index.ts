export type CaseStatus = '未訪問' | '訪問対象外' | '訪問対象' | '媒介' | '契約';
export type CaseRank = 'A' | 'B' | 'C';
export type CaseCategory = '任意売却' | '相続' | '収益物件' | '販売物件';
export const ALL_CATEGORIES: CaseCategory[] = ['任意売却', '相続', '収益物件', '販売物件'];
export type VisitResult = '○' | '△' | '✖';
export type HaitoKigen =
  // 過去
  | '1週間前' | '2週間前' | '3週間前' | '1ヶ月前' | '2ヶ月前' | '3ヶ月前' | '3ヶ月以上前'
  // 未来
  | '1週間以内' | '2週間以内' | '3週間以内' | '1ヶ月以内' | '2ヶ月以内' | '3ヶ月以内';

export const ALL_HAITO_KIGEN: HaitoKigen[] = [
  '1週間以内', '2週間以内', '3週間以内', '1ヶ月以内', '2ヶ月以内', '3ヶ月以内',
];

const HAITO_KIGEN_THRESHOLD: Partial<Record<HaitoKigen, number>> = {
  '1週間以内': 7, '2週間以内': 14, '3週間以内': 21,
  '1ヶ月以内': 30, '2ヶ月以内': 60, '3ヶ月以内': 90,
};

// 選択した「以内」フィルターに案件が該当するか（累積: 3ヶ月以内は1週間以内も含む）
// 「1ヶ月以内」= 今日から±30日以内（過去・未来の両方向）
export function matchesHaitoKigen(dateStr: string | undefined, filter: HaitoKigen): boolean {
  if (!dateStr) return false;
  const now  = new Date();
  const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const days = Math.round((target.getTime() - base.getTime()) / 86400000);
  const threshold = HAITO_KIGEN_THRESHOLD[filter];
  return threshold !== undefined && Math.abs(days) <= threshold;
}

export const HAITO_KIGEN_COLORS: Record<HaitoKigen, string> = {
  '3ヶ月以上前': '#4a5568',
  '3ヶ月前':    '#6b7280',
  '2ヶ月前':    '#78909c',
  '1ヶ月前':    '#90a4ae',
  '3週間前':    '#e67e22',
  '2週間前':    '#e74c3c',
  '1週間前':    '#c0392b',
  '1週間以内':  '#e74c3c',
  '2週間以内':  '#e67e22',
  '3週間以内':  '#f1c40f',
  '1ヶ月以内':  '#2980b9',
  '2ヶ月以内':  '#5dade2',
  '3ヶ月以内':  '#27ae60',
};

export function getHaitoKigen(dateStr?: string): HaitoKigen | null {
  if (!dateStr) return null;
  const now  = new Date();
  const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const days   = Math.round((target.getTime() - base.getTime()) / 86400000);
  if (days < 0) {
    // 過去（配当要求日を過ぎた）
    if (days >= -7)  return '1週間前';
    if (days >= -14) return '2週間前';
    if (days >= -21) return '3週間前';
    if (days >= -30) return '1ヶ月前';
    if (days >= -60) return '2ヶ月前';
    if (days >= -90) return '3ヶ月前';
    return '3ヶ月以上前';
  }
  // 未来（配当要求日まで残り）
  if (days <= 7)  return '1週間以内';
  if (days <= 14) return '2週間以内';
  if (days <= 21) return '3週間以内';
  if (days <= 30) return '1ヶ月以内';
  if (days <= 60) return '2ヶ月以内';
  if (days <= 90) return '3ヶ月以内';
  return null;
}

export interface Visit {
  id: string;
  // DBカラム
  property_id?: string;
  contact_type?: string;
  summary?: string;
  judgment?: VisitResult | null;
  next_action?: string;
  next_date?: string;
  requests?: string;
  recorded_by?: string;
  created_at?: string;
  // UIで使うエイリアス（dbToVisitで付与）
  date: string;
  result: VisitResult | null;
  memo: string;
}

export interface Case {
  id: string;
  address: string;
  ownerName: string;
  status: CaseStatus;
  rank: CaseRank;
  category: CaseCategory;
  lat: number;
  lng: number;
  isGeocoded?: boolean;
  ownerAddress?: string;
  ownerLat?: number;
  ownerLng?: number;
  isOwnerGeocoded?: boolean;
  haitoDate?: string;
  phone?: string;
  loanAmount?: number;
  bankName?: string;
  assignee?: string;
  caseNumber?: string;
  notes?: string;
  updatedAt?: string;
  visits: Visit[];
}

// 資料の分類（案件詳細で4分類を同時表示する）
export const FILE_CATEGORIES = ['写真', '登記簿', '物件目録', 'その他'] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

// 所有者住所ピンの色（所在地ピンはステータス色で塗り分け）
export const OWNER_PIN_COLOR = '#e91e63';

export const STATUS_COLORS: Record<CaseStatus, string> = {
  '未訪問': '#f39c12',
  '訪問対象外': '#95a5a6',
  '訪問対象': '#2980b9',
  '媒介': '#27ae60',
  '契約': '#e67e22',
};

export const RANK_COLORS: Record<CaseRank, string> = {
  A: '#e74c3c',
  B: '#f39c12',
  C: '#95a5a6',
};
