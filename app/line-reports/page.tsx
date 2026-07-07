import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { LineReportList } from './LineReportList'
import { ReporterSettings } from './ReporterSettings'
import { listReporters } from './actions'

export const dynamic = 'force-dynamic'

export default async function LineReportsPage() {
  const [{ data }, reporters] = await Promise.all([
    supabase
      .from('line_reports')
      .select('id, raw_text, parsed, group_id, created_at')
      .eq('status', 'unmatched')
      .order('created_at', { ascending: false })
      .limit(100),
    listReporters(),
  ])

  return (
    <div className="flex flex-col h-full">
      <Header title="未処理報告" backHref="/" />
      <div className="flex-1 overflow-y-auto pb-4">
        <ReporterSettings reporters={reporters} />
        <LineReportList reports={data ?? []} />
      </div>
    </div>
  )
}
