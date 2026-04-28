'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CaseRank, CaseStatus } from '@/types'

export async function createProperty(data: {
  address: string
  owner_name: string
  status: CaseStatus
  rank: CaseRank
  assignee: string | null
  case_number: string | null
  phone: string | null
  notes: string | null
}) {
  const { error } = await supabase.from('properties').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  redirect('/cases')
}
