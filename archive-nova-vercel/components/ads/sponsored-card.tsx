'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AdCampaign } from '@/lib/types'

export function SponsoredCard({ placement = 'FEED', compact = false }: { placement?: AdCampaign['placement']; compact?: boolean }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [ad, setAd] = useState<AdCampaign | null>(null)
  const tracked = useRef(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.rpc('get_active_ad', { placement_name: placement }).then(({ data }) => {
      if (!active || !data || typeof data !== 'object') return
      const row = data as Record<string, unknown>
      if (!row.id) return
      setAd({
        id: String(row.id), advertiser_name: String(row.advertiser_name || ''), title: String(row.title || ''), body: String(row.body || ''),
        image_url: row.image_url ? String(row.image_url) : null, target_url: String(row.target_url || '#'), placement: String(row.placement || placement) as AdCampaign['placement'],
        status: String(row.status || 'ACTIVE') as AdCampaign['status'], impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0),
      })
    })
    return () => { active = false }
  }, [placement, supabase])

  useEffect(() => {
    if (!ad || !supabase || tracked.current) return
    tracked.current = true
    void supabase.rpc('track_ad_event', { target_ad: ad.id, event_type: 'IMPRESSION' })
  }, [ad, supabase])

  if (!ad) return null

  async function click() {
    if (supabase && ad) void supabase.rpc('track_ad_event', { target_ad: ad.id, event_type: 'CLICK' })
  }

  return (
    <aside className={`sponsored-card ${compact ? 'compact' : ''}`} aria-label="Publicidade">
      <div className="sponsored-label"><span>Patrocinado</span><small>Publicidade</small></div>
      <a href={ad.target_url} target="_blank" rel="sponsored noopener noreferrer" onClick={() => void click()}>
        {ad.image_url ? <img src={ad.image_url} alt="" /> : <div className="sponsored-art">✦</div>}
        <div className="sponsored-copy"><span>{ad.advertiser_name}</span><h3>{ad.title}</h3>{ad.body ? <p>{ad.body}</p> : null}<b>Saiba mais →</b></div>
      </a>
    </aside>
  )
}
