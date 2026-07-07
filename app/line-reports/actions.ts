'use server'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'

interface Parsed {
  memo?: string
  visit_result?: '不在' | '対応済み' | '再訪問' | '対象外' | '要連絡' | null
  next_action?: string
  tasha_hata?: boolean
}

const RESULT_JUDGMENT: Record<string, '○' | '△' | '✖'> = {
  '対応済み': '○', '要連絡': '○',
  '再訪問': '△', '不在': '△',
  '対象外': '✖',
}

// 未処理報告を案件に手動で紐付ける（webhookの自動登録と同じ処理を行う）
export async function linkReportToProperty(reportId: string, propertyId: string) {
  const { data: report } = await supabase
    .from('line_reports')
    .select('raw_text, parsed, line_user_id')
    .eq('id', reportId)
    .single()
  if (!report) throw new Error('報告が見つかりません')

  const parsed = (report.parsed ?? {}) as Parsed
  const { data: reporter } = await supabase
    .from('line_reporters')
    .select('display_name, assignee')
    .eq('line_user_id', report.line_user_id)
    .single()
  const reporterName = reporter?.display_name ?? '不明'

  await supabase.from('visits').insert({
    property_id: propertyId,
    contact_type: 'LINE報告',
    summary: parsed.memo ?? report.raw_text,
    judgment: parsed.visit_result ? RESULT_JUDGMENT[parsed.visit_result] ?? null : null,
    next_action: parsed.next_action ?? null,
    recorded_by: reporterName,
  })

  const { data: prop } = await supabase
    .from('properties')
    .select('status, assignee, notes')
    .eq('id', propertyId)
    .single()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.tasha_hata || parsed.visit_result === '対象外') {
    patch.status = '訪問対象外'
  } else if (prop?.status === '未訪問' && parsed.visit_result) {
    patch.status = '訪問対象'
  }
  if (!prop?.assignee && reporter?.assignee) patch.assignee = reporter.assignee
  if (parsed.memo) {
    const stamp = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    const line = `${stamp} ${reporterName}: ${parsed.memo}`
    patch.notes = prop?.notes ? `${line}\n${prop.notes}` : line
  }
  await supabase.from('properties').update(patch).eq('id', propertyId)

  await supabase.from('line_reports').update({ property_id: propertyId, status: 'processed' }).eq('id', reportId)
  revalidatePath('/line-reports')
  revalidatePath(`/case/${propertyId}`)
}

export async function ignoreReport(reportId: string) {
  await supabase.from('line_reports').update({ status: 'ignored' }).eq('id', reportId)
  revalidatePath('/line-reports')
}

export async function listReporters() {
  const { data } = await supabase
    .from('line_reporters')
    .select('line_user_id, display_name, assignee')
    .order('display_name')
  return data ?? []
}

export async function setReporterAssignee(lineUserId: string, assignee: string) {
  await supabase.from('line_reporters').update({ assignee: assignee || null }).eq('line_user_id', lineUserId)
  revalidatePath('/line-reports')
}

export async function searchPropertiesForLink(keyword: string) {
  if (!keyword.trim()) return []
  const { data } = await supabase
    .from('properties')
    .select('id, owner_name, address')
    .or(`owner_name.ilike.%${keyword}%,address.ilike.%${keyword}%,case_number.ilike.%${keyword}%`)
    .order('updated_at', { ascending: false })
    .limit(8)
  return data ?? []
}
