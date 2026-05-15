import { createAdminClient } from '@/lib/supabase'
import { addPrefecture } from '@/lib/address'

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

// 未配置物件を最大 `batches` バッチ分ジオコーディング（1バッチ=5件）
export async function autoGeocode(batches = 10): Promise<void> {
  const supabase = createAdminClient()

  for (let i = 0; i < batches; i++) {
    const { data: properties } = await supabase
      .from('properties')
      .select('id, address')
      .or('lat.is.null,lat.eq.0')
      .not('address', 'is', null)
      .limit(5)

    if (!properties?.length) break

    for (const prop of properties) {
      if (!prop.address?.trim()) continue
      const fullAddress = addPrefecture(prop.address)
      let coords = await geocodeGSI(fullAddress)
      if (!coords) coords = await geocodeNominatim(fullAddress)

      if (coords) {
        const [lat, lng] = coords
        await supabase.from('properties').update({ lat, lng }).eq('id', prop.id)
      } else {
        await supabase.from('properties').update({ lat: 0, lng: 0 }).eq('id', prop.id)
      }
      await new Promise((r) => setTimeout(r, 300))
    }
  }
}
