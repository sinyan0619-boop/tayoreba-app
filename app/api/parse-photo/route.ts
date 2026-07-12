import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const SINGLE_PROMPT = `この画像は不動産競売に関する資料です。以下のJSON形式で情報を抽出してください。

{
  "address": "所在地・住所（文字列 または null）",
  "owner_name": "所有者名・債務者名（文字列 または null）",
  "case_number": "事件番号（文字列 または null）",
  "haito_date": "配当要求終期日（YYYY-MM-DD形式 または null）",
  "loan_amount": "残債額・評価額（万円単位の整数 または null）",
  "bank_name": "金融機関名・申立人（文字列 または null）",
  "phone": "電話番号（文字列 または null）",
  "assignee": "担当者名（文字列 または null）"
}

JSONのみ返してください。余分な説明は不要です。`

// 複数行の一覧表（収益物件リストなど）から全行を抽出する
const TABLE_PROMPT = `この画像は不動産物件の一覧表です。各行を1件として、以下のJSON形式で全行を抽出してください。

{
  "properties": [
    {
      "address": "住所・所在地の列（文字列 または null）",
      "owner_name": "氏名・所有者名の列（文字列 または null。空欄なら null）",
      "notes": "物件名・種類（区分/戸建/共同住宅）・所有者住所など、住所と氏名以外の情報を『物件名:○○ / 種類:○○ / 所有者住所:○○』の形でまとめた文字列（無ければ null）"
    }
  ]
}

注意：
- 表の見出し行（通番・報告日・種類・住所・物件名・所有者住所・氏名などのラベル行）は除外してください
- 住所は画像に記載されている文字列をそのまま返し、カッコ内（住居表示など）も省略しないでください
- 空欄のセルは null にしてください
- JSONのみ返してください。余分な説明は不要です。`

export async function POST(req: NextRequest) {
  const { base64, mediaType, mode } = await req.json()
  if (!base64) return NextResponse.json({ error: '画像データがありません' }, { status: 400 })

  const isTable = mode === 'table'
  const client = new Anthropic()

  let message
  try {
    message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: isTable ? 4096 : 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: isTable ? TABLE_PROMPT : SINGLE_PROMPT,
          },
        ],
      },
    ],
  })
  } catch (e: any) {
    return NextResponse.json({ error: `AI解析に失敗しました: ${String(e?.message ?? e).slice(0, 300)}` }, { status: 500 })
  }

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    const json = JSON.parse(match ? match[0] : cleaned)
    return NextResponse.json(json)
  } catch {
    return NextResponse.json({ error: 'AI解析に失敗しました' }, { status: 500 })
  }
}
