'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { SponsoredCard } from '@/components/ads/sponsored-card'
import { WorkCard } from '@/components/work-card'
import type { DiscoveryItem, WorkCardData } from '@/lib/types'

type Mode = 'RECOMMENDED' | 'RECENT'

function normalizeWork(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''), creator_id: String(row.creator_id || ''), title: String(row.title || ''), summary: String(row.summary || ''),
    rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'], status: String(row.status || 'ONGOING') as WorkCardData['status'], visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'],
    language: String(row.language || 'pt-BR'), expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters), word_count: Number(row.word_count || 0), chapter_count: Number(row.chapter_count || 0),
    kudos_count: Number(row.kudos_count || 0), bookmarks_count: Number(row.bookmarks_count || 0), comments_count: Number(row.comments_count || 0), hits_count: Number(row.hits_count || 0), allow_comments: Boolean(row.allow_comments),
    published_at: row.published_at ? String(row.published_at) : null, updated_at: String(row.updated_at || ''), created_at: String(row.created_at || ''), author_username: String(row.author_username || ''),
    author_display_name: String(row.author_display_name || row.author_username || ''), fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [], tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    allow_contributions: Boolean(row.allow_contributions),
  }
}

export function DiscoveryFeed() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [mode, setMode] = useState<Mode>('RECOMMENDED')
  const [items, setItems] = useState<DiscoveryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) { setLoading(false); setError('Supabase não configurado.'); return }
    let active = true
    setLoading(true); setError('')
    void supabase.rpc('discovery_feed', { feed_mode: mode, limit_count: 30, offset_count: 0 }).then(({ data, error: feedError }) => {
      if (!active) return
      if (feedError) { console.error(feedError); setError('Não foi possível carregar o feed. Execute a migration v4 no Supabase.'); setItems([]) }
      else setItems(((data || []) as Array<Record<string, unknown>>).map((item) => ({ work: normalizeWork((item.work || {}) as Record<string, unknown>), reason: String(item.reason || '') })))
      setLoading(false)
    })
    return () => { active = false }
  }, [mode, supabase])

  async function toggleBookmark(work: WorkCardData) {
    if (!supabase) return
    const user = (await supabase.auth.getUser()).data.user
    if (!user) { window.location.href = `/explore?auth=login&return=${encodeURIComponent('/feed')}`; return }
    const { data, error: bookmarkError } = await supabase.rpc('toggle_bookmark', { target_work: work.id })
    if (bookmarkError) { setError('Não foi possível atualizar sua biblioteca.'); return }
    const bookmarked = Boolean(data)
    setItems((current) => current.map((item) => item.work.id === work.id ? { ...item, work: { ...item.work, bookmarked, bookmarks_count: Math.max(0, item.work.bookmarks_count + (bookmarked ? 1 : -1)) } } : item))
  }

  return (
    <>
      <NovaHeader title="Feed" />
      <main className="discovery-page">
        <section className="discovery-hero"><div><p className="eyebrow">Descoberta</p><h1>Seu próximo arquivo favorito.</h1><p>Recomendações transparentes, histórias recém-publicadas e nenhum ranking secreto.</p></div><div className="feed-philosophy"><span>✦</span><div><strong>Por que isto apareceu?</strong><p>O Archive Nova mostra o motivo de cada recomendação: tags, fandoms, autores seguidos ou destaque da comunidade.</p></div></div></section>
        <nav className="discovery-tabs"><button className={mode === 'RECOMMENDED' ? 'active' : ''} onClick={() => setMode('RECOMMENDED')}>Para você</button><button className={mode === 'RECENT' ? 'active' : ''} onClick={() => setMode('RECENT')}>Recém-publicadas</button><Link href="/posts">Posts da comunidade</Link></nav>
        {loading ? <div className="feed-skeleton">{Array.from({ length: 6 }).map((_, index) => <div key={index} />)}</div> : null}
        {error ? <div className="community-message error">{error}</div> : null}
        {!loading && !error ? <section className="discovery-grid">{items.map((item, index) => <div className="discovery-item" key={item.work.id}><div className="recommendation-reason"><span>✦</span>{item.reason}</div><WorkCard work={item.work} onOpen={(id) => { window.location.href = `/works/${id}` }} onBookmark={(work) => void toggleBookmark(work)} />{index === 4 ? <SponsoredCard placement="FEED" /> : null}</div>)}</section> : null}
        {!loading && !error && !items.length ? <div className="studio-empty large"><span>⌕</span><h2>Ainda estamos conhecendo seus gostos</h2><p>Leia, salve e siga autores. O feed fica melhor conforme você usa o Archive Nova.</p><Link className="primary-button" href="/explore">Explorar histórias</Link></div> : null}
      </main>
    </>
  )
}
