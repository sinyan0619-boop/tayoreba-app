import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { RankBadge, StatusBadge } from '@/components/StatusBadge';
import { getCaseById } from '@/lib/mockData';

interface Props {
  params: Promise<{ id: string }>;
}

const RESULT_LABEL: Record<string, string> = {
  '○': '対応あり',
  '△': '不在・様子見',
  '✖': '対応不可',
};

const RESULT_COLOR: Record<string, string> = {
  '○': 'text-green-600',
  '△': 'text-yellow-600',
  '✖': 'text-red-500',
};

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params;
  const c = getCaseById(id);
  if (!c) notFound();

  const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(c.address)}`;

  return (
    <div className="flex flex-col h-full">
      <Header title={c.ownerName} backHref="/" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 物件情報 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} />
            <RankBadge rank={c.rank} />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 shrink-0">住所</span>
              <span className="text-gray-900 font-medium">{c.address}</span>
            </div>
            {c.phone && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 shrink-0">電話</span>
                <a
                  href={`tel:${c.phone}`}
                  className="text-blue-600 font-medium underline"
                >
                  {c.phone}
                </a>
              </div>
            )}
            {c.bankName && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 shrink-0">金融機関</span>
                <span className="text-gray-900">{c.bankName}</span>
              </div>
            )}
            {c.loanAmount && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 shrink-0">残債額</span>
                <span className="text-gray-900 font-medium">
                  {c.loanAmount.toLocaleString()}万円
                </span>
              </div>
            )}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50 transition-colors"
          >
            <span>🗺️</span>
            Googleマップ
          </a>
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50 transition-colors"
            >
              <span>📞</span>
              電話をかける
            </a>
          )}
        </div>

        <Link
          href={`/record/${c.id}`}
          className="flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-sm active:opacity-90 transition-opacity"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          <span>✏️</span>
          訪問記録を入力
        </Link>

        {/* 訪問履歴タイムライン */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-700 text-sm">
              訪問履歴
            </span>
            <span className="ml-2 text-xs text-gray-400">{c.visits.length}回</span>
          </div>

          {c.visits.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              訪問記録がありません
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...c.visits]
                .reverse()
                .map((v) => (
                  <div key={v.id} className="px-4 py-3 flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`text-xl font-bold leading-none ${RESULT_COLOR[v.result]}`}
                      >
                        {v.result}
                      </span>
                      <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500">{v.date}</span>
                        <span className={`text-xs font-medium ${RESULT_COLOR[v.result]}`}>
                          {RESULT_LABEL[v.result]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {v.memo}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
