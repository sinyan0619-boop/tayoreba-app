'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const STATUSES = ['すべて', '未訪問', '訪問対象外', '訪問対象', '媒介', '契約']
const PREFS    = ['すべて', '京都', '滋賀', '大阪']

const selectCls = 'flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-400 min-w-0'

export function CasesFilter({ assignees }: { assignees: string[] }) {
  const router = useRouter()
  const sp     = useSearchParams()
  const q        = sp.get('q')        ?? ''
  const status   = sp.get('status')   ?? ''
  const pref     = sp.get('pref')     ?? ''
  const assignee = sp.get('assignee') ?? ''

  const update = (key: string, val: string) => {
    const params = new URLSearchParams(sp.toString())
    if (val) params.set(key, val)
    else params.delete(key)
    router.push(`/cases?${params.toString()}`)
  }

  return (
    <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2 shrink-0">
      <input
        type="search"
        value={q}
        onChange={(e) => update('q', e.target.value)}
        placeholder="名前・住所で検索..."
        className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2 bg-white focus:outline-none focus:border-blue-400"
      />
      <div className="flex gap-2">
        <select value={status} onChange={(e) => update('status', e.target.value)} className={selectCls}>
          {STATUSES.map((s) => <option key={s} value={s === 'すべて' ? '' : s}>{s}</option>)}
        </select>
        <select value={pref} onChange={(e) => update('pref', e.target.value)} className={selectCls}>
          {PREFS.map((p) => <option key={p} value={p === 'すべて' ? '' : p}>{p}</option>)}
        </select>
        {assignees.length > 0 && (
          <select value={assignee} onChange={(e) => update('assignee', e.target.value)} className={selectCls}>
            <option value="">担当者</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
