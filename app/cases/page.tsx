import Link from 'next/link';
import { Suspense } from 'react';
import Header from '@/components/Header';
import { supabase, dbToCase } from '@/lib/supabase';
import { matchesHaitoKigen, HaitoKigen } from '@/types';
import { CasesFilter } from './CasesFilter';
import CasesList from '@/components/CasesList';

export const revalidate = 0;

function detectPref(address: string): string {
  if (address.includes('大阪')) return '大阪'
  if (/滋賀県|大津市|草津市|彦根市|長浜市|守山市|栗東市|甲賀市|野洲市|湖南市|高島市|東近江市|米原市/.test(address)) return '滋賀'
  if (/兵庫県|神戸市|姫路市|尼崎市|明石市|西宮市|芦屋市|伊丹市|宝塚市|川西市|三田市|加古川市|高砂市|西脇市|小野市|加西市|丹波市|丹波篠山市|養父市|朝来市|宍粟市|加東市|たつの市|赤穂市|相生市|豊岡市|南あわじ市|淡路市|洲本市|三木市/.test(address)) return '兵庫'
  return '京都'
}

interface Props {
  searchParams: Promise<{ status?: string; pref?: string; assignee?: string; q?: string; haito_kigen?: string }>
}

export default async function CasesPage({ searchParams }: Props) {
  const { status, pref, assignee, q, haito_kigen } = await searchParams

  // タイムリミット = haito_date + 3ヶ月。その1週間前にアラート
  const base = new Date();
  base.setMonth(base.getMonth() - 3);
  const rangeStart = base.toISOString().split('T')[0];
  const rangeEnd   = new Date(base.getTime() + 7 * 86400000).toISOString().split('T')[0];

  const [queryResult, urgentResult] = await Promise.all([
    (() => {
      let query = supabase
        .from('properties')
        .select('*, visits(*)')
        .order('updated_at', { ascending: false })
      if (status) query = query.eq('status', status)
      return query
    })(),
    supabase
      .from('properties')
      .select('id, owner_name, haito_date')
      .gte('haito_date', rangeStart)
      .lte('haito_date', rangeEnd)
      .order('haito_date'),
  ])

  const { data } = queryResult
  const urgentCases = urgentResult.data ?? []
  let cases = (data ?? []).map(dbToCase)

  if (pref)        cases = cases.filter((c) => detectPref(c.address) === pref)
  if (assignee)    cases = cases.filter((c) => c.assignee === assignee)
  if (haito_kigen) cases = cases.filter((c) => matchesHaitoKigen(c.haitoDate, haito_kigen as HaitoKigen))
  if (q) {
    const term = q.toLowerCase()
    cases = cases.filter((c) =>
      c.ownerName.toLowerCase().includes(term) ||
      c.address.toLowerCase().includes(term)
    )
  }

  const assignees = [...new Set(
    (data ?? []).map((r) => r.assignee).filter(Boolean) as string[]
  )].sort()

  return (
    <div className="flex flex-col h-full">
      <Header
        title="案件一覧"
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/cases/new"
              className="flex items-center gap-1 bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full"
            >
              ＋ 追加
            </Link>
            <Link
              href="/import"
              className="flex items-center gap-1 bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full"
            >
              📥 CSV
            </Link>
          </div>
        }
      />

      <Suspense fallback={null}>
        <CasesFilter assignees={assignees} />
      </Suspense>

      {urgentCases.length > 0 && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-2 shrink-0">
          <div className="text-xs font-bold text-red-700 mb-1.5">
            ⚠️ タイムリミット1週間以内（配当日+3ヶ月） — {urgentCases.length}件
          </div>
          <div className="space-y-1">
            {urgentCases.map((u) => (
              <Link
                key={u.id}
                href={`/case/${u.id}`}
                className="flex items-center justify-between text-xs text-red-700 hover:text-red-900"
              >
                <span className="font-medium truncate">{u.owner_name || '（名前なし）'}</span>
                <span className="text-red-400 shrink-0 ml-2">{u.haito_date}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <span className="text-3xl">📋</span>
            案件がありません
            <Link href="/cases/new" className="text-blue-500 text-xs">案件を追加 ›</Link>
          </div>
        ) : (
          <CasesList cases={cases} />
        )}
      </div>
    </div>
  );
}
