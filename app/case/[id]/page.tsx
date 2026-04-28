import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { RankBadge } from '@/components/StatusBadge';
import { supabase, dbToCase } from '@/lib/supabase';
import { DeleteButton } from './DeleteButton';
import { StatusSelect } from './StatusSelect';
import { RankSelect } from './RankSelect';
import { VisitDeleteButton } from './VisitDeleteButton';

interface Props {
  params: Promise<{ id: string }>;
}

const RESULT_LABEL: Record<string, string> = {
  '○': '対応あり', '△': '不在・様子見', '✖': '対応不可',
};
const RESULT_COLOR: Record<string, string> = {
  '○': 'text-green-600', '△': 'text-yellow-600', '✖': 'text-red-500',
};

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params;

  const { data } = await supabase
    .from('properties')
    .select('*, visits(*)')
    .eq('id', id)
    .order('created_at', { referencedTable: 'visits', ascending: false })
    .single();

  if (!data) notFound();
  const c = dbToCase(data);

  const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(c.address)}`;

  return (
    <div className="flex flex-col h-full">
      <Header
        title={c.ownerName}
        backHref="/cases"
        right={
          <Link href={`/case/${id}/edit`} className="text-white/80 text-sm px-2 py-1">
            編集
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 物件情報 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
          {c.assignee && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full inline-block">
              👤 {c.assignee}
            </span>
          )}

          <StatusSelect id={c.id} current={c.status} />
          <RankSelect   id={c.id} current={c.rank} />

          <div className="space-y-2 text-sm pt-1">
            <Row label="住所"   value={c.address} />
            {c.phone      && <Row label="電話"     value={<a href={`tel:${c.phone}`} className="text-blue-600 underline">{c.phone}</a>} />}
            {c.caseNumber && <Row label="事件番号" value={c.caseNumber} />}
            {c.bankName   && <Row label="金融機関" value={c.bankName} />}
            {c.loanAmount && <Row label="残債額"   value={`${c.loanAmount.toLocaleString()}万円`} />}
            {c.notes      && <Row label="備考"     value={c.notes} />}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50"
          >
            <span>🗺️</span> Googleマップ
          </a>
          {c.phone && (
            <a
              href={`tel:${c.phone}`}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50"
            >
              <span>📞</span> 電話をかける
            </a>
          )}
        </div>

        <Link
          href={`/record/${c.id}`}
          className="flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white active:opacity-90"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          <span>✏️</span> 訪問記録を入力
        </Link>

        <DeleteButton id={c.id} />

        {/* 訪問履歴タイムライン */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-700 text-sm">訪問履歴</span>
            <span className="ml-2 text-xs text-gray-400">{c.visits.length}回</span>
          </div>

          {c.visits.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              訪問記録がありません
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {c.visits.map((v) => (
                <div key={v.id} className="px-4 py-3 flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`text-xl font-bold leading-none ${RESULT_COLOR[v.result ?? ''] ?? 'text-gray-400'}`}>
                      {v.result ?? '―'}
                    </span>
                    <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-gray-500">{v.date}</span>
                      {v.result && (
                        <span className={`text-xs font-medium ${RESULT_COLOR[v.result]}`}>
                          {RESULT_LABEL[v.result]}
                        </span>
                      )}
                      {v.contact_type && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {v.contact_type}
                        </span>
                      )}
                    </div>
                    {v.memo && <p className="text-sm text-gray-700 leading-relaxed">{v.memo}</p>}
                    {v.next_action && (
                      <p className="text-xs text-blue-600 mt-1">▶ {v.next_action}</p>
                    )}
                    {v.next_date && (
                      <p className="text-xs text-gray-400 mt-0.5">次回: {v.next_date}</p>
                    )}
                  </div>
                  <VisitDeleteButton visitId={v.id} propertyId={c.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-16 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium flex-1">{value}</span>
    </div>
  );
}
