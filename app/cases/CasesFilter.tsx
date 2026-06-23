'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ALL_HAITO_KIGEN, ALL_CATEGORIES, CaseCategory } from '@/types'

const STATUSES = ['未訪問', '訪問対象外', '訪問対象', '媒介', '契約']
const PREFS    = ['京都', '滋賀', '大阪', '兵庫']
const RANKS    = ['A', 'B', 'C']

const selectCls = 'flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-blue-400 min-w-0'

export function CasesFilter({ assignees }: { assignees: string[] }) {
  const router = useRouter()
  const sp     = useSearchParams()
  const q          = sp.get('q')           ?? ''
  const status     = sp.get('status')      ?? ''
  const pref       = sp.get('pref')        ?? ''
  const assignee   = sp.get('assignee')    ?? ''
  const haitoKigen = sp.get('haito_kigen') ?? ''
  const rank       = sp.get('rank')        ?? ''
  const category   = (sp.get('category')  ?? '任意売却') as CaseCategory

  const [inputValue, setInputValue] = useState(q)
  useEffect(() => setInputValue(q), [q])

  useEffect(() => {
    try {
      sessionStorage.setItem('tayoreba_case_filter', JSON.stringify({ status, haitoKigen, pref, assignee, q, rank }))
    } catch {}
  }, [status, haitoKigen, pref, assignee, q, rank])

  const update = (key: string, val: string) => {
    const params = new URLSearchParams(sp.toString())
    if (val) params.set(key, val)
    else params.delete(key)
    router.push(`/cases?${params.toString()}`)
  }

  const switchCategory = (cat: CaseCategory) => {
    router.push(`/cases?category=${encodeURIComponent(cat)}`)
  }

  const submitSearch = (val: string) => update('q', val)

  return (
    <div className="bg-white border-b border-gray-100 shrink-0">
      <div className="flex border-b border-gray-100">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => switchCategory(cat)}
            className="flex-1 py-2.5 text-xs font-medium transition-colors"
            style={category === cat
              ? { color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }
              : { color: '#9ca3af', borderBottom: '2px solid transparent' }}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="px-4 py-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="search"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitSearch(inputValue)}
          placeholder="名前・住所で検索... （Enterで検索）"
          className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 bg-white focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={() => submitSearch(inputValue)}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white shrink-0"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          検索
        </button>
      </div>
      <div className="flex gap-2">
        <select value={status} onChange={(e) => update('status', e.target.value)} className={selectCls}>
          <option value="">ステータス</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={pref} onChange={(e) => update('pref', e.target.value)} className={selectCls}>
          <option value="">エリア</option>
          {PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {assignees.length > 0 && (
          <select value={assignee} onChange={(e) => update('assignee', e.target.value)} className={selectCls}>
            <option value="">担当者</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <select value={haitoKigen} onChange={(e) => update('haito_kigen', e.target.value)} className={selectCls}>
          <option value="">配当期限（すべて）</option>
          {ALL_HAITO_KIGEN.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={rank} onChange={(e) => update('rank', e.target.value)} className={selectCls}>
          <option value="">ランク</option>
          {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      </div>
    </div>
  )
}
