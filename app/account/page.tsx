import Header from '@/components/Header'
import { createClient } from '@/lib/supabase-server'
import { signOut } from './actions'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user?.id)
    .single()

  return (
    <div className="flex flex-col h-full">
      <Header title="アカウント" />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <div className="text-xs text-gray-500">表示名</div>
            <div className="font-bold text-gray-900 mt-0.5 text-lg">
              {profile?.display_name ?? '未設定'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">メールアドレス</div>
            <div className="font-medium text-gray-700 mt-0.5">{user?.email}</div>
          </div>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full py-3.5 rounded-xl border border-red-200 text-red-500 text-sm font-medium active:bg-red-50"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  )
}
