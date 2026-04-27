'use client'
import { useState } from 'react'
import { deleteBatch } from './actions'

export function DeleteBatchButton({ batchId, count }: { batchId: string; count: number }) {
  const [pending, setPending] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`このインポート（${count}件）を削除しますか？\n案件と訪問履歴が全て削除されます。`)) return
    setPending(true)
    await deleteBatch(batchId)
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="w-full py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium active:bg-red-50 disabled:opacity-50"
    >
      {pending ? '削除中...' : `${count}件をまとめて削除`}
    </button>
  )
}
