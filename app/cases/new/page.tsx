'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import { CaseCategory, CaseRank, CaseStatus, RANK_COLORS, STATUS_COLORS } from '@/types'
import { createProperty } from './actions'

const STATUSES: CaseStatus[] = ['未訪問', '訪問対象外', '訪問対象', '媒介', '契約']
const RANKS: CaseRank[] = ['A', 'B', 'C']

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const labelCls = 'text-xs text-gray-500 mb-1.5 block'

function NewCaseForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const initialCategory = (sp.get('category') ?? '任意売却') as CaseCategory

  const [address, setAddress]       = useState('')
  const [ownerName, setOwnerName]   = useState('')
  const [status, setStatus]         = useState<CaseStatus>('未訪問')
  const [rank, setRank]             = useState<CaseRank>('C')
  const [assignee, setAssignee]     = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [phone, setPhone]           = useState('')
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    if (!address.trim()) { alert('住所を入力してください'); return }
    setSaving(true)
    await createProperty({
      address:      address.trim(),
      owner_name:   ownerName.trim() || '（未記入）',
      status,
      rank,
      category:     initialCategory,
      assignee:     assignee.trim()    || null,
      case_number:  caseNumber.trim()  || null,
      phone:        phone.trim()       || null,
      notes:        notes.trim()       || null,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={`案件追加（${initialCategory}）`} backHref={`/cases?category=${encodeURIComponent(initialCategory)}`} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <label className={labelCls}>住所 <span className="text-red-500">*</span></label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例: 京都市中京区..." className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>所有者名</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="例: 山田 太郎" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>電話番号</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例: 075-000-0000" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>担当者</label>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="例: 田中" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>事件番号</label>
            <input value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="例: 2024-001" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>備考</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="メモ..." rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <label className={labelCls}>ステータス</label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                  style={status === s
                    ? { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s], color: '#fff' }
                    : { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#374151' }}
                >{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>ランク</label>
            <div className="flex gap-2">
              {RANKS.map((r) => (
                <button key={r} onClick={() => setRank(r)}
                  className="w-10 h-10 rounded-full text-sm font-bold border-2 transition-all"
                  style={rank === r
                    ? { backgroundColor: RANK_COLORS[r], borderColor: RANK_COLORS[r], color: '#fff' }
                    : { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#374151' }}
                >{r}</button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          {saving ? '保存中...' : '案件を追加'}
        </button>
      </div>
    </div>
  )
}

export default function NewCasePage() {
  return (
    <Suspense fallback={null}>
      <NewCaseForm />
    </Suspense>
  )
}
