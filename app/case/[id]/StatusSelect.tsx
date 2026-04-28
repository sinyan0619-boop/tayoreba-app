'use client'
import { useState } from 'react'
import { CaseStatus, STATUS_COLORS } from '@/types'
import { updateStatus } from './actions'

const STATUSES: CaseStatus[] = ['未訪問', '訪問対象外', '訪問対象', '媒介', '契約']

export function StatusSelect({ id, current }: { id: string; current: CaseStatus }) {
  const [status, setStatus] = useState(current)
  const [pending, setPending] = useState(false)

  const handleChange = async (next: CaseStatus) => {
    if (next === status || pending) return
    setPending(true)
    setStatus(next)
    await updateStatus(id, next)
    setPending(false)
  }

  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">ステータス</div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => handleChange(s)}
            disabled={pending}
            className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all disabled:opacity-60"
            style={
              status === s
                ? { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s], color: '#fff' }
                : { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#374151' }
            }
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
