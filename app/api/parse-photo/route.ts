import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { base64, mediaType } = await req.json()
  if (!base64) return NextResponse.json({ error: '画像データがありません' }, { status: 400 })

  const client = new Anthropic()

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
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
            text: `この画像は不動産競売に関する資料です。以下のJSON形式で情報を抽出してください。

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

JSONのみ返してください。余分な説明は不要です。`,
          },
        ],
      },
    ],
  })

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const json = JSON.parse(cleaned)
    return NextResponse.json(json)
  } catch {
    return NextResponse.json({ error: 'AI解析に失敗しました' }, { status: 500 })
  }
}
