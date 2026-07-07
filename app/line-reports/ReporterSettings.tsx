'use client'
import { useState } from 'react'
import { setReporterAssignee } from './actions'

interface Reporter {
  line_user_id: string
  display_name: string | null
  assignee: string | null
}

const ASSIGNEES = ['近藤晃平', '安田', '小原', '共同']

export function ReporterSettings({ reporters }: { reporters: Reporter[] }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(reporters)

  if (reporters.length === 0) return null

  const handleChange = async (lineUserId: string, assignee: string) => {
    setItems((prev) => prev.map((r) => (r.line_user_id === lineUserId ? { ...r, assignee } : r)))
    await setReporterAssignee(lineUserId, assignee)
  }

  return (
    <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700"
      >
        <span>👤 LINE報告者 → 担当者の設定</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="divide-y divide-gray-100">
          {items.map((r) => (
            <div key={r.line_user_id} className="flex items-center justify-between px-4 py-2.5 gap-3">
              <span className="text-sm text-gray-800 truncate">{r.display_name ?? '(名前不明)'}</span>
              <select
                value={r.assignee ?? ''}
                onChange={(e) => handleChange(r.line_user_id, e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white shrink-0"
              >
                <option value="">未設定</option>
                {ASSIGNEES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
