import { NextRequest, NextResponse } from 'next/server'
import { pushLineNotify } from '@/lib/line-notify'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { message } = await req.json()
  if (message) await pushLineNotify(message)
  return NextResponse.json({ ok: true })
}
