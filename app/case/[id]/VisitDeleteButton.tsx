'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteVisit } from './actions'

export function VisitDeleteButton({ visitId, propertyId }: { visitId: string; propertyId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const handleDelete = async () => {
    if (!confirm('この訪問記録を削除しますか？')) return
    setPending(true)
    await deleteVisit(visitId, propertyId)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="text-gray-300 hover:text-red-400 active:text-red-500 transition-colors disabled:opacity-40 p-1"
      title="削除"
    >
      🗑
    </button>
  )
}
