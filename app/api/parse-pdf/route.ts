import { NextRequest, NextResponse } from 'next/server'
import { addPrefecture } from '@/lib/address'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          } as any,
          {
            type: 'text',
            text: `このPDFは不動産競売物件の一覧表です。以下の形式でJSONを返してください：

{
  "title_date": "タイトル行にある日付（YYYY-MM-DD形式。なければnull）",
  "properties": [
    {
      "address": "所在地（住所）",
      "owner_name": "所有者名",
      "case_number": "事件番号",
      "notes": "備考・備考2を結合したもの"
    }
  ]
}

注意：
- 所有者が複数いる場合は最初の1人のみ
- 住所の変換ルール：「〇〇丁目△△番（住居番号）」の形式の場合、丁目までの町名＋カッコ内の番号を使う。例：「小松町二丁目５５番１（４－２６）」→「小松町二丁目４－２６」、「稲葉荘一丁目１１番２（１４－１７）」→「稲葉荘一丁目１４－１７」。丁目がない場合は町名まで＋カッコ内の番号。カッコがない場合はそのまま。
- JSONのみ返してください`,
          },
        ],
      },
    ],
  })

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ error: 'データを抽出できませんでした' }, { status: 422 })

  const parsed = JSON.parse(match[0])
  if (Array.isArray(parsed.properties)) {
    parsed.properties = parsed.properties.map((p: any) => ({
      ...p,
      address: p.address ? addPrefecture(p.address) : p.address,
    }))
  }
  return NextResponse.json(parsed)
}
