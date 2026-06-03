import Link from 'next/link';
import Header from '@/components/Header';
import { RankBadge, StatusBadge } from '@/components/StatusBadge';
import { supabase, dbToCase } from '@/lib/supabase';
import { Case } from '@/types';

export const revalidate = 30;

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;
}

const RESULT_COLOR: Record<string, string> = {
  '○': 'text-green-600', '△': 'text-yellow-600', '✖': 'text-red-500',
};
const RESULT_LABEL: Record<string, string> = {
  '○': '対応あり', '△': '不在・様子見', '✖': '対応不可',
};

function CaseRow({ c, dimmed = false }: { c: Case; dimmed?: boolean }) {
  const latestVisit = c.visits[0];
  const preview = latestVisit?.next_action || latestVisit?.memo;

  return (
    <div className={`flex items-center px-4 py-3 gap-2 ${dimmed ? 'opacity-50' : ''}`}>
      <Link href={`/case/${c.id}`} className="flex items-center flex-1 min-w-0 gap-3">
        <RankBadge rank={c.rank} size="sm" />
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-sm ${dimmed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
            {c.ownerName}
          </div>
          <div className="text-xs text-gray-500 truncate mt-0.5">{c.address}</div>
          {latestVisit && (
            <div className="flex items-center gap-1.5 mt-1">
              {latestVisit.result && (
                <span className={`text-xs font-bold ${RESULT_COLOR[latestVisit.result]}`}>
                  {latestVisit.result} {RESULT_LABEL[latestVisit.result]}
                </span>
              )}
              {preview && (
                <span className="text-xs text-gray-400 truncate">— {preview}</span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="flex items-center gap-1 shrink-0">
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 text-base"
          >
            📞
          </a>
        )}
        <a
          href={mapsUrl(c.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 text-base"
        >
          🗺️
        </a>
        <Link href={`/record/${c.id}`}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200 text-base"
        >
          ✏️
        </Link>
      </div>
    </div>
  );
}

export default async function TodayPage() {
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('properties')
    .select('*, visits(*)')
    .in('status', ['未訪問', '訪問対象', '媒介'])
    .order('rank', { ascending: true });

  const allCases = (data ?? []).map(dbToCase);

  const visitTargets = allCases.filter((c) => ['訪問対象', '媒介'].includes(c.status));
  const unvisited    = allCases.filter((c) => c.status === '未訪問');

  const completedToday = visitTargets.filter((c) =>
    c.visits.some((v) => v.date === today)
  );
  const remaining = visitTargets.filter((c) =>
    !c.visits.some((v) => v.date === today)
  );

  // 次回訪問予定日=今日の案件（全ステータス対象）
  const todayAppo = allCases.filter((c) => {
    const latest = c.visits[0];
    return latest?.next_date === today;
  });

  const total    = visitTargets.length;
  const done     = completedToday.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const dateStr = new Date().toLocaleDateString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
  });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="たよれば"
        right={<span className="text-white/70 text-xs whitespace-nowrap">{dateStr}</span>}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* 進捗バー */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">今日の進捗</span>
            <span className="text-sm font-bold text-gray-800">{done} / {total} 件完了</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: progress === 100 ? '#27ae60' : '#2980b9',
              }}
            />
          </div>
          {progress === 100 && total > 0 && (
            <p className="text-xs text-green-600 font-medium text-center">全件完了 🎉</p>
          )}
        </div>

        {/* 今日のアポ */}
        {todayAppo.length > 0 && (
          <div className="bg-blue-50 rounded-2xl overflow-hidden shadow-sm border border-blue-100">
            <div className="px-4 py-3 border-b border-blue-100 flex items-center gap-2">
              <span className="text-blue-600 text-base">📅</span>
              <span className="font-semibold text-blue-700 text-sm">今日のアポ</span>
              <span className="ml-auto text-xs text-blue-500">{todayAppo.length}件</span>
            </div>
            <div className="divide-y divide-blue-100">
              {todayAppo.map((c) => (
                <CaseRow key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}

        {/* 残りの訪問 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center">
            <span className="font-semibold text-gray-700 text-sm">残りの訪問</span>
            <span className="ml-2 text-xs text-gray-400">{remaining.length}件</span>
          </div>
          <div className="divide-y divide-gray-100">
            {remaining.map((c) => <CaseRow key={c.id} c={c} />)}
            {remaining.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">
                残りの訪問はありません
              </div>
            )}
          </div>
        </div>

        {/* 未訪問 */}
        {unvisited.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700 text-sm">未訪問</span>
                <span className="text-xs text-gray-400">{unvisited.length}件</span>
              </div>
              <Link href="/cases?status=未訪問" className="text-blue-500 text-xs">全て見る ›</Link>
            </div>
            <div className="divide-y divide-gray-100">
              {unvisited.slice(0, 5).map((c) => <CaseRow key={c.id} c={c} />)}
              {unvisited.length > 5 && (
                <div className="px-4 py-2 text-center text-xs text-gray-400">
                  他 {unvisited.length - 5} 件
                </div>
              )}
            </div>
          </div>
        )}

        {/* 今日の完了 */}
        {completedToday.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="font-semibold text-gray-500 text-sm">今日の完了</span>
              <span className="text-xs text-gray-400">{completedToday.length}件</span>
            </div>
            <div className="divide-y divide-gray-100">
              {completedToday.map((c) => <CaseRow key={c.id} c={c} dimmed />)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
