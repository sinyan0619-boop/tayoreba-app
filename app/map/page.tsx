'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import { supabase, dbToCase } from '@/lib/supabase';
import { Case, CaseRank, CaseStatus, STATUS_COLORS } from '@/types';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const STATUSES: CaseStatus[] = ['未訪問', '訪問対象外', '訪問対象', '媒介', '契約'];
const RANKS: CaseRank[]      = ['A', 'B', 'C'];

export default function MapPage() {
  const router = useRouter();
  const [cases, setCases]           = useState<Case[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selStatuses, setSelStatuses] = useState<Set<CaseStatus>>(new Set());
  const [selRanks, setSelRanks]       = useState<Set<CaseRank>>(new Set());

  useEffect(() => {
    supabase
      .from('properties')
      .select('*, visits(*)')
      .then(({ data }) => {
        setCases((data ?? []).map(dbToCase));
        setLoading(false);
      });
  }, []);

  const toggle = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  };

  const filtered = cases.filter((c) => {
    if (selStatuses.size > 0 && !selStatuses.has(c.status)) return false;
    if (selRanks.size > 0 && !selRanks.has(c.rank)) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="地図" />

      {/* フィルター */}
      <div className="bg-white border-b border-gray-200 px-3 pt-2 pb-2 space-y-1.5 shrink-0">
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setSelStatuses((p) => toggle(p, s))}
              className="px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
              style={
                selStatuses.has(s)
                  ? { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s], color: '#fff' }
                  : { backgroundColor: '#fff', color: '#555', borderColor: '#ddd' }
              }
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {RANKS.map((r) => (
            <button
              key={r}
              onClick={() => setSelRanks((p) => toggle(p, r))}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all
                ${selRanks.has(r) ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300'}`}
            >
              ランク{r}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">
            {loading ? '読込中...' : `${filtered.length}件`}
          </span>
        </div>
      </div>

      {/* 地図 */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            地図を読み込み中...
          </div>
        ) : (
          <MapView
            cases={filtered}
            height="100%"
            onMarkerClick={(id) => router.push(`/case/${id}`)}
          />
        )}
      </div>

      {/* 凡例 */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 flex gap-3 flex-wrap shrink-0">
        {STATUSES.map((s) => (
          <div key={s} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[s] }} />
            <span className="text-xs text-gray-600">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
