'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CaseCategory, CaseRank, CaseStatus } from '@/types'
import { autoGeocode } from '@/lib/geocode'

export async function createProperty(data: {
  address: string
  owner_address: string | null
  owner_name: string
  status: CaseStatus
  rank: CaseRank
  category: CaseCategory
  assignee: string | null
  case_number: string | null
  phone: string | null
  notes: string | null
}) {
  const { error } = await supabase.from('properties').insert(data)
  if (error) throw new Error(error.message)
  autoGeocode(data.owner_address ? 2 : 1).catch(() => {})
  revalidatePath('/cases')
  redirect(`/cases?category=${encodeURIComponent(data.category)}`)
}
