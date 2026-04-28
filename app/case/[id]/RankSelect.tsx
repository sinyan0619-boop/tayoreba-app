'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CaseRank, RANK_COLORS } from '@/types'
import { updateRank } from './actions'

const RANKS: CaseRank[] = ['A', 'B', 'C']

export function RankSelect({ id, current }: { id: string; current: CaseRank }) {
  const router = useRouter()
  const [rank, setRank] = useState(current)
  const [pending, setPending] = useState(false)

  const handleChange = async (next: CaseRank) => {
    if (next === rank || pending) return
    setPending(true)
    setRank(next)
    await updateRank(id, next)
    router.refresh()
    setPending(false)
  }

  return (
    <div>
      <div className="text-xs text-gray-500 mb-2">ランク</div>
      <div className="flex gap-2">
        {RANKS.map((r) => (
          <button
            key={r}
            onClick={() => handleChange(r)}
            disabled={pending}
            className="w-10 h-10 rounded-full text-sm font-bold border-2 transition-all disabled:opacity-60"
            style={
              rank === r
                ? { backgroundColor: RANK_COLORS[r], borderColor: RANK_COLORS[r], color: '#fff' }
                : { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#374151' }
            }
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
