'use client'
import { useState } from 'react'
import { updatePassword } from '@/app/login/actions'

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

export default function ResetPasswordPage() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)

  const handleSubmit = async () => {
    if (password !== confirm) {
      setErrorMsg('パスワードが一致しません')
      return
    }
    if (password.length < 6) {
      setErrorMsg('パスワードは6文字以上にしてください')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    const err = await updatePassword(password)
    if (err) { setErrorMsg(err); setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 pt-14 pb-8 text-center" style={{ backgroundColor: '#1a1a2e' }}>
        <div className="text-4xl font-bold text-white tracking-tight">たよれば</div>
        <div className="text-white/60 text-sm mt-2">パスワード再設定</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">新しいパスワード</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">新しいパスワード（確認）</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="もう一度入力" className={inputCls} />
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
          style={{ backgroundColor: '#1a1a2e' }}
        >
          {loading ? '処理中...' : 'パスワードを変更する'}
        </button>
      </div>
    </div>
  )
}
