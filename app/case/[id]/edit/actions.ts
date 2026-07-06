'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export async function updateProperty(id: string, data: {
  address: string
  owner_address: string | null
  owner_address_changed?: boolean
  owner_name: string
  assignee: string | null
  case_number: string | null
  phone: string | null
  bank_name: string | null
  loan_amount: number | null
  notes: string | null
  haito_date: string | null
}) {
  const { owner_address_changed, ...fields } = data
  const patch: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() }
  // 所有者住所が変わったら座標をリセットし、地図の「未配置」から再ジオコーディングさせる
  if (owner_address_changed) {
    patch.owner_lat = null
    patch.owner_lng = null
  }
  const { error } = await supabase
    .from('properties')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  revalidatePath(`/case/${id}`)
  redirect(`/case/${id}`)
}
