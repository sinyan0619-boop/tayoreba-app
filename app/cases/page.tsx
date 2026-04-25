import Link from 'next/link';
import Header from '@/components/Header';
import { RankBadge, StatusBadge } from '@/components/StatusBadge';
import { supabase, dbToCase } from '@/lib/supabase';

export const revalidate = 30;

export default async function CasesPage() {
  const { data } = await supabase
    .from('properties')
    .select('*, visits(*)')
    .order('rank', { ascending: true })
    .order('created_at', { ascending: false });

  const cases = (data ?? []).map(dbToCase);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="案件一覧"
        right={
          <Link
            href="/import"
            className="flex items-center gap-1 bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full"
          >
            <span>📥</span> CSVインポート
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <span className="text-3xl">📋</span>
            案件がありません
            <Link href="/import" className="text-blue-500 text-xs">CSVからインポート ›</Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 bg-white">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/case/${c.id}`}
                className="flex items-center px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <RankBadge rank={c.rank} />
                <div className="ml-3 flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{c.ownerName}</div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{c.address}</div>
                  {c.visits.length > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      最終訪問: {c.visits[c.visits.length - 1].date}
                    </div>
                  )}
                </div>
                <div className="ml-2 flex items-center gap-2 shrink-0">
                  <StatusBadge status={c.status} size="sm" />
                  <span className="text-gray-400">›</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
