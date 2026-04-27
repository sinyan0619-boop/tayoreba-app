'use client'
import { useState } from 'react'
import { deleteProperty } from './actions'

export function DeleteButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false)

  const handleDelete = async () => {
    if (!confirm('この案件を削除しますか？\n訪問履歴も全て削除されます。')) return
    setPending(true)
    await deleteProperty(id)
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="w-full py-3.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium active:bg-red-50 disabled:opacity-50"
    >
      {pending ? '削除中...' : 'この案件を削除'}
    </button>
  )
}
