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

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, address')
    .or('lat.is.null,lat.eq.0')
    .not('address', 'is', null)
    .limit(5)

  if (error) return NextResponse.json({ error: `DB読み込みエラー: ${error.message}` }, { status: 500 })
  if (!properties?.length) return NextResponse.json({ geocoded: 0, remaining: 0, done: true })

  let geocoded = 0
  const log: string[] = []

  for (const prop of properties) {
    if (!prop.address?.trim()) continue

    const fullAddress = addPrefecture(prop.address)
    let coords = await geocodeGSI(fullAddress)
    let source = 'GSI'
    if (!coords) {
      coords = await geocodeNominatim(fullAddress)
      source = 'Nominatim'
    }

    if (coords) {
      const [lat, lng] = coords
      const { error: ue } = await supabase
        .from('properties')
        .update({ lat, lng })
        .eq('id', prop.id)
      if (ue) {
        log.push(`✖ DB更新失敗 ${prop.address.slice(0, 20)}: ${ue.message}`)
      } else {
        geocoded++
        log.push(`✓ [${source}] ${prop.address.slice(0, 20)}`)
      }
    } else {
      await supabase.from('properties').update({ lat: 0, lng: 0 }).eq('id', prop.id)
      log.push(`― 住所不明 ${prop.address.slice(0, 20)}`)
    }

    await new Promise((r) => setTimeout(r, 300))
  }

  const { count } = await supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .or('lat.is.null,lat.eq.0')

  return NextResponse.json({
    geocoded,
    remaining: count ?? 0,
    done: (count ?? 0) === 0,
    log,
  })
}
