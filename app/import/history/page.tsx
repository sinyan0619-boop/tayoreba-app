import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DeleteBatchButton } from './DeleteBatchButton'

export const revalidate = 0

type BatchRow = {
  date: string
  count: number
  samples: { owner: string; address: string }[]
}

export default async function ImportHistoryPage() {
  const { data } = await supabase
    .from('properties')
    .select('import_batch_id, created_at, address, owner_name')
    .not('import_batch_id', 'is', null)
    .order('created_at', { ascending: false })

  const batchMap = new Map<string, BatchRow>()
  for (const row of data ?? []) {
    const bid = row.import_batch_id as string
    if (!batchMap.has(bid)) {
      batchMap.set(bid, {
        date: (row.created_at as string).replace('T', ' ').slice(0, 16),
        count: 0,
        samples: [],
      })
    }
    const b = batchMap.get(bid)!
    b.count++
    if (b.samples.length < 3) {
      b.samples.push({ owner: row.owner_name, address: row.address })
    }
  }

  const batches = Array.from(batchMap.entries())

  return (
    <div className="flex flex-col h-full">
      <Header title="インポート履歴" backHref="/import" />

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
            <span className="text-3xl">📋</span>
            インポート履歴がありません
          </div>
        ) : (
          batches.map(([batchId, batch]) => (
            <div key={batchId} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div>
                <div className="font-semibold text-gray-800 text-sm">{batch.date}</div>
                <div className="text-xs text-gray-500 mt-0.5">{batch.count}件インポート</div>
              </div>
              <div className="space-y-1 border-l-2 border-gray-100 pl-3">
                {batch.samples.map((s, i) => (
                  <div key={i} className="text-xs text-gray-500 truncate">
                    {s.owner} — {s.address}
                  </div>
                ))}
                {batch.count > 3 && (
                  <div className="text-xs text-gray-400">他 {batch.count - 3} 件</div>
                )}
              </div>
              <DeleteBatchButton batchId={batchId} count={batch.count} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
