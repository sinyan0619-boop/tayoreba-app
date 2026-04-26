import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = 'https://dudohddweivuoaxgtik.supabase.co/rest/v1/properties';
  const key = 'sb_publishable__Tzg8urjfpW0g_USZ_zMBg_RwXXT8MK';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        address: 'テスト住所 大阪市北区1-2-3',
        owner_name: 'テスト太郎',
        status: '未訪問',
        rank: 'C',
      }),
    });

    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      body,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
