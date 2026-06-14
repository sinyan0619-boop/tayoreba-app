import { NextRequest, NextResponse } from 'next/server'
import { addPrefecture } from '@/lib/address'

// 「〇〇丁目△△番△△（住居表示またはマンション名）」→「〇〇丁目住居表示/マンション名」
function normalizeAddress(address: string): string {
  // 全角・半角カッコ対応、丁目後の地番部分（数字・番・地・スペース）を除去
  const m = address.match(/^(.*?丁目)[　 \s]*[\d０-９番地\s]*[（(]([^）)]+)[）)]/)
  if (m) return (m[1] + m[2]).trim()
  return address
}

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 })

  try {
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
- 所在地はPDFに記載されている文字列をそのまま返す（カッコや内容を変換・省略しない）
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

  let parsed: any
  try {
    parsed = JSON.parse(match[0])
  } catch {
    // 制御文字を除去してリトライ
    const cleaned = match[0].replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    parsed = JSON.parse(cleaned)
  }
  if (Array.isArray(parsed.properties)) {
    parsed.properties = parsed.properties.map((p: any) => ({
      ...p,
      address: p.address ? addPrefecture(normalizeAddress(p.address)) : p.address,
    }))
  }
  return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('parse-pdf error:', err)
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 })
  }
}
