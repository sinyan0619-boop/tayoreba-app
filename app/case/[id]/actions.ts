'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CaseRank, CaseStatus } from '@/types'

export async function deleteProperty(id: string) {
  const { error } = await supabase.from('properties').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  redirect('/cases')
}

export async function updateStatus(id: string, status: CaseStatus) {
  const { error } = await supabase
    .from('properties')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  revalidatePath(`/case/${id}`)
}

export async function updateRank(id: string, rank: CaseRank) {
  const { error } = await supabase
    .from('properties')
    .update({ rank, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  revalidatePath(`/case/${id}`)
}

export async function deleteVisit(visitId: string, propertyId: string) {
  const { error } = await supabase.from('visits').delete().eq('id', visitId)
  if (error) throw new Error(error.message)
  revalidatePath(`/case/${propertyId}`)
}
