'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { CaseStatus } from '@/types'

export async function deleteProperty(id: string) {
  const { error } = await supabase.from('properties').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  redirect('/cases')
}

export async function updateStatus(id: string, status: CaseStatus) {
  const { error } = await supabase
    .from('properties')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  revalidatePath(`/case/${id}`)
}
