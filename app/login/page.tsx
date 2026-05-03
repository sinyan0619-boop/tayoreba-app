'use client'
import { useState } from 'react'
import { signIn, signUp } from './actions'

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading]       = useState(false)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setErrorMsg(null)
    const err = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password, displayName)
    if (err) { setErrorMsg(err); setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 pt-14 pb-8 text-center" style={{ backgroundColor: '#1a1a2e' }}>
        <div className="text-4xl font-bold text-white tracking-tight">たよれば</div>
        <div className="text-white/60 text-sm mt-2">不動産任意売却 営業支援</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* タブ */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setErrorMsg(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
                ${mode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
            >
              {m === 'login' ? 'ログイン' : '新規登録'}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          {mode === 'signup' && (
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">表示名</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: 田中 太郎" className={inputCls} />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">パスワード</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上" className={inputCls} />
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
          {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録してはじめる'}
        </button>
      </div>
    </div>
  )
}
