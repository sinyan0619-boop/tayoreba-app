import Link from 'next/link';
import Header from '@/components/Header';
import MiniMap from '@/components/MiniMap';
import { RankBadge, StatusBadge } from '@/components/StatusBadge';
import { mockCases } from '@/lib/mockData';

export default function TodayPage() {
  const today = new Date().toISOString().split('T')[0];

  const visitTargets = mockCases.filter(
    (c) => c.status === '訪問対象' || c.status === '媒介'
  );
  const completedToday = mockCases.filter((c) =>
    c.visits.some((v) => v.date === today)
  );
  const rankA = visitTargets.filter((c) => c.rank === 'A');

  const dateStr = new Date().toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  const sorted = [...visitTargets].sort((a, b) =>
    a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="たよれば"
        right={
          <span className="text-white/70 text-xs whitespace-nowrap">
            {dateStr}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 統計カード */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-blue-600">
              {visitTargets.length}
            </div>
            <div className="text-xs text-gray-500 mt-1">訪問予定</div>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-green-600">
              {completedToday.length}
            </div>
            <div className="text-xs text-gray-500 mt-1">今日完了</div>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="text-2xl font-bold text-red-500">{rankA.length}</div>
            <div className="text-xs text-gray-500 mt-1">ランクA</div>
          </div>
        </div>

        {/* ミニ地図 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">
              エリアマップ
            </span>
            <Link href="/map" className="text-blue-500 text-xs font-medium">
              全表示 ›
            </Link>
          </div>
          <MiniMap cases={visitTargets} height="170px" zoom={12} />
        </div>

        {/* 訪問リスト */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-700 text-sm">
              今日の訪問リスト
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {sorted.map((c) => (
              <Link
                key={c.id}
                href={`/case/${c.id}`}
                className="flex items-center px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <RankBadge rank={c.rank} size="sm" />
                <div className="ml-3 flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">
                    {c.ownerName}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {c.address}
                  </div>
                </div>
                <div className="ml-2 flex items-center gap-2 shrink-0">
                  <StatusBadge status={c.status} size="sm" />
                  <span className="text-gray-400 text-sm">›</span>
                </div>
              </Link>
            ))}
            {sorted.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">
                今日の訪問予定はありません
              </div>
            )}
          </div>
        </div>

        {/* 未訪問リスト */}
        {mockCases.filter((c) => c.status === '未訪問').length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="font-semibold text-gray-700 text-sm">
                未訪問案件
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {mockCases
                .filter((c) => c.status === '未訪問')
                .map((c) => (
                  <Link
                    key={c.id}
                    href={`/case/${c.id}`}
                    className="flex items-center px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <RankBadge rank={c.rank} size="sm" />
                    <div className="ml-3 flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">
                        {c.ownerName}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {c.address}
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm ml-2">›</span>
                  </Link>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
