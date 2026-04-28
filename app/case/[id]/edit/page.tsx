import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import { supabase, dbToCase } from '@/lib/supabase'
import { EditForm } from './EditForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditPage({ params }: Props) {
  const { id } = await params
  const { data } = await supabase.from('properties').select('*').eq('id', id).single()
  if (!data) notFound()
  const c = dbToCase(data)

  return (
    <div className="flex flex-col h-full">
      <Header title="案件編集" backHref={`/case/${id}`} />
      <div className="flex-1 overflow-y-auto p-4">
        <EditForm c={c} />
      </div>
    </div>
  )
}
