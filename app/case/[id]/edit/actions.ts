'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export async function updateProperty(id: string, data: {
  address: string
  owner_name: string
  assignee: string | null
  case_number: string | null
  phone: string | null
  bank_name: string | null
  loan_amount: number | null
  notes: string | null
  haito_date: string | null
}) {
  const { error } = await supabase
    .from('properties')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  revalidatePath(`/case/${id}`)
  redirect(`/case/${id}`)
}
