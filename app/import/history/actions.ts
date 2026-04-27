'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export async function deleteBatch(batchId: string) {
  const { error } = await supabase
    .from('properties')
    .delete()
    .eq('import_batch_id', batchId)
  if (error) throw new Error(error.message)
  revalidatePath('/cases')
  revalidatePath('/import/history')
  redirect('/import/history')
}
