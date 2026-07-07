'use client'
import { useState } from 'react'
import Link from 'next/link'
import { linkReportToProperty, ignoreReport, searchPropertiesForLink } from './actions'

interface Report {
  id: string
  raw_text: string
  parsed: { memo?: string; address?: string; owner_name?: string; visit_result?: string } | null
  group_id: string | null
  created_at: string
}

interface Candidate {
  id: string
  owner_name: string
  address: string
}

export function LineReportList({ reports }: { reports: Report[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [items, setItems] = useState(reports)

  const handleSearch = async (v: string) => {
    setKeyword(v)
    if (!v.trim()) { setCandidates([]); return }
    setSearching(true)
    const results = await searchPropertiesForLink(v)
    setCandidates(results as Candidate[])
    setSearching(false)
  }

  const handleLink = async (reportId: string, propertyId: string) => {
    setBusyId(reportId)
    await linkReportToProperty(reportId, propertyId)
    setItems((prev) => prev.filter((r) => r.id !== reportId))
    setOpenId(null); setKeyword(''); setCandidates([])
    setBusyId(null)
  }

  const handleIgnore = async (reportId: string) => {
    setBusyId(reportId)
    await ignoreReport(reportId)
    setItems((prev) => prev.filter((r) => r.id !== reportId))
    setBusyId(null)
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-gray-400 text-sm">
        未処理の報告はありません 🎉
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {items.map((r) => (
        <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div className="text-xs text-gray-400">
            {new Date(r.created_at).toLocaleString('ja-JP')}
            {r.group_id && <span className="ml-2 bg-gray-100 px-1.5 py-0.5 rounded">グループ</span>}
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.raw_text}</p>
          {r.parsed?.address && (
            <p className="text-xs text-gray-500">推定住所: {r.parsed.address}</p>
          )}

          {openId === r.id ? (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <input
                autoFocus
                value={keyword}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="氏名・住所・事件番号で検索"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2"
              />
              {searching && <p className="text-xs text-gray-400">検索中...</p>}
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleLink(r.id, c.id)}
                  disabled={busyId === r.id}
                  className="w-full text-left text-sm bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2 disabled:opacity-50"
                >
                  <div className="font-medium text-gray-900">{c.owner_name}</div>
                  <div className="text-xs text-gray-500">{c.address}</div>
                </button>
              ))}
              <button onClick={() => { setOpenId(null); setKeyword(''); setCandidates([]) }} className="text-xs text-gray-400">
                キャンセル
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setOpenId(r.id)}
                className="flex-1 text-xs bg-gray-800 text-white px-3 py-2 rounded-full active:opacity-80"
              >
                案件を紐付け
              </button>
              <button
                onClick={() => handleIgnore(r.id)}
                disabled={busyId === r.id}
                className="text-xs text-gray-400 border border-gray-200 px-3 py-2 rounded-full disabled:opacity-50"
              >
                無視する
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
