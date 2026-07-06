import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { addPrefecture } from '@/lib/address'

export const dynamic = 'force-dynamic'

async function geocodeGSI(address: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`,
      { signal: AbortSignal.timeout(4000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data) && data[0]?.geometry?.coordinates) {
      const [lng, lat] = data[0].geometry.coordinates as [number, number]
      return [lat, lng]
    }
  } catch {}
  return null
}

async function geocodeNominatim(address: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ' 日本')}&format=json&limit=1&countrycodes=jp`,
      {
        headers: { 'User-Agent': 'tayoreba-app/1.0 (sinyan0619@gmail.com)' },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  } catch {}
  return null
}

export async function POST() {
  const supabase = createAdminClient()

  // 所在地（lat/lng）と所有者住所（owner_lat/owner_lng）の両方を対象にする
  const { data: pendingAddr, error } = await supabase
    .from('properties')
    .select('id, address')
    .or('lat.is.null,lat.eq.0')
    .not('address', 'is', null)
    .limit(5)

  if (error) return NextResponse.json({ error: `DB読み込みエラー: ${error.message}` }, { status: 500 })

  const jobs: { id: string; address: string; kind: 'addr' | 'owner' }[] =
    (pendingAddr ?? [])
      .filter((p) => p.address?.trim())
      .map((p) => ({ id: p.id, address: p.address as string, kind: 'addr' as const }))

  if (jobs.length < 5) {
    const { data: pendingOwner } = await supabase
      .from('properties')
      .select('id, owner_address')
      .is('owner_lat', null)
      .not('owner_address', 'is', null)
      .limit(5 - jobs.length)
    for (const p of pendingOwner ?? []) {
      if (p.owner_address?.trim()) jobs.push({ id: p.id, address: p.owner_address, kind: 'owner' })
    }
  }

  if (!jobs.length) return NextResponse.json({ geocoded: 0, remaining: 0, done: true })

  let geocoded = 0
  const log: string[] = []

  for (const job of jobs) {
    const fullAddress = addPrefecture(job.address)
    let coords = await geocodeGSI(fullAddress)
    let source = 'GSI'
    if (!coords) {
      coords = await geocodeNominatim(fullAddress)
      source = 'Nominatim'
    }

    const labelPrefix = job.kind === 'owner' ? '所有者住所 ' : ''
    if (coords) {
      const [lat, lng] = coords
      const patch = job.kind === 'owner' ? { owner_lat: lat, owner_lng: lng } : { lat, lng }
      const { error: ue } = await supabase.from('properties').update(patch).eq('id', job.id)
      if (ue) {
        log.push(`✖ DB更新失敗 ${labelPrefix}${job.address.slice(0, 20)}: ${ue.message}`)
      } else {
        geocoded++
        log.push(`✓ [${source}] ${labelPrefix}${job.address.slice(0, 20)}`)
      }
    } else {
      const patch = job.kind === 'owner' ? { owner_lat: 0, owner_lng: 0 } : { lat: 0, lng: 0 }
      await supabase.from('properties').update(patch).eq('id', job.id)
      log.push(`― 住所不明 ${labelPrefix}${job.address.slice(0, 20)}`)
    }

    await new Promise((r) => setTimeout(r, 300))
  }

  const { count: addrCount } = await supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .or('lat.is.null,lat.eq.0')
  const { count: ownerCount } = await supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .is('owner_lat', null)
    .not('owner_address', 'is', null)

  const remaining = (addrCount ?? 0) + (ownerCount ?? 0)
  return NextResponse.json({
    geocoded,
    remaining,
    done: remaining === 0,
    log,
  })
}
