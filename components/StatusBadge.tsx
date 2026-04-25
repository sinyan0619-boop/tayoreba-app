import { CaseRank, CaseStatus, RANK_COLORS, STATUS_COLORS } from '@/types';

interface StatusProps {
  status: CaseStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusProps) {
  const cls = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span
      className={`inline-block rounded-full font-medium text-white ${cls}`}
      style={{ backgroundColor: STATUS_COLORS[status] }}
    >
      {status}
    </span>
  );
}

interface RankProps {
  rank: CaseRank;
  size?: 'sm' | 'md';
}

export function RankBadge({ rank, size = 'md' }: RankProps) {
  const cls =
    size === 'sm' ? 'text-xs w-5 h-5 text-[11px]' : 'w-7 h-7 text-sm';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ${cls}`}
      style={{ backgroundColor: RANK_COLORS[rank] }}
    >
      {rank}
    </span>
  );
}
