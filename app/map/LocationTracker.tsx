'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'

export function LocationTracker({ userId, displayName }: { userId: string; displayName: string }) {
  useEffect(() => {
    if (!navigator.geolocation) return
    const supabase = createClient()

    const send = () => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await supabase.from('user_locations').upsert({
          user_id:      userId,
          display_name: displayName,
          lat:          pos.coords.latitude,
          lng:          pos.coords.longitude,
          updated_at:   new Date().toISOString(),
        })
      }, undefined, { timeout: 10000 })
    }

    send()
    const timer = setInterval(send, 30000)
    return () => clearInterval(timer)
  }, [userId, displayName])

  return null
}
