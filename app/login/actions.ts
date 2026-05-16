'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'

export async function signIn(email: string, password: string): Promise<string | null> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return error.message
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signUp(email: string, password: string, displayName: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return error.message
  if (data.user) {
    await supabase.from('profiles').insert({ id: data.user.id, display_name: displayName })
  }
  revalidatePath('/', 'layout')
  redirect('/')
}
