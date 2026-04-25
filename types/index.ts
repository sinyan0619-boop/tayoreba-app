export type CaseStatus = '未訪問' | '訪問対象外' | '訪問対象' | '媒介' | '契約';
export type CaseRank = 'A' | 'B' | 'C';
export type VisitResult = '○' | '△' | '✖';

export interface Visit {
  id: string;
  date: string;
  result: VisitResult;
  memo: string;
}

export interface Case {
  id: string;
  address: string;
  ownerName: string;
  status: CaseStatus;
  rank: CaseRank;
  lat: number;
  lng: number;
  phone?: string;
  loanAmount?: number;
  bankName?: string;
  assignee?: string;    // 担当者
  caseNumber?: string;  // 事件番号
  notes?: string;       // 備考
  visits: Visit[];
}

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
