'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { WorkCardData } from '@/lib/types'

function normalizeWork(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''), creator_id: String(row.creator_id || ''), title: String(row.title || ''), summary: String(row.summary || ''),
    rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'], status: String(row.status || 'ONGOING') as WorkCardData['status'], visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'], language: String(row.language || 'pt-BR'), expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters), word_count: Number(row.word_count || 0), chapter_count: Number(row.chapter_count || 0), kudos_count: Number(row.kudos_count || 0), bookmarks_count: Number(row.bookmarks_count || 0), comments_count: Number(row.comments_count || 0), hits_count: Number(row.hits_count || 0), allow_comments: Boolean(row.allow_comments), published_at: row.published_at ? String(row.published_at) : null, updated_at: String(row.updated_at || ''), created_at: String(row.created_at || ''), author_username: String(row.author_username || ''), author_display_name: String(row.author_display_name || row.author_username || ''), fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [], tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  }
}

function formatNumber(value: number) { return new Intl.NumberFormat('pt-BR', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value || 0) }

type ProfilePayload = {
  profile: { id: string; username: string; display_name: string | null; bio: string | null; created_at: string }
  stats: { works: number; words: number; hits: number; kudos: number; followers: number }
  viewer: { is_self: boolean; following: boolean; blocked: boolean }
  works: Record<string, unknown>[]
}

export function PublicProfilePage({ username }: { username: string }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [payload, setPayload] = useState<ProfilePayload | null>(null)
  const [works, setWorks] = useState<WorkCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!supabase) { setLoading(false); setError('Supabase não configurado.'); return }
    const current = (await supabase.auth.getUser()).data.user || null
    setUser(current)
    const { data, error: profileError } = await supabase.rpc('get_public_profile', { profile_username: decodeURIComponent(username) })
    if (profileError) {
      console.error(profileError)
      setError(profileError.message?.includes('PROFILE_BLOCKED') ? 'Este perfil não está disponível para esta conta.' : 'Perfil não encontrado.')
      setLoading(false)
      return
    }
    const next = data as ProfilePayload
    setPayload(next)
    setWorks((next.works || []).map(normalizeWork))
    setLoading(false)
  }

  useEffect(() => { void load() }, [username, supabase])

  function requireLogin() {
    if (user) return true
    window.location.href = `/explore?auth=login&return=${encodeURIComponent(`/users/${username}`)}`
    return false
  }

  async function toggleFollow() {
    if (!payload || !supabase || !requireLogin()) return
    setBusy(true)
    const { data, error: followError } = await supabase.rpc('toggle_user_subscription', { target_author: payload.profile.id })
    setBusy(false)
    if (followError) { setMessage('Não foi possível alterar o acompanhamento deste autor.'); return }
    setPayload((current) => current ? { ...current, viewer: { ...current.viewer, following: Boolean(data) }, stats: { ...current.stats, followers: Math.max(0, current.stats.followers + (data ? 1 : -1)) } } : current)
    setMessage(data ? 'Você agora segue este autor.' : 'Você deixou de seguir este autor.')
  }

  async function toggleBlock() {
    if (!payload || !supabase || !requireLogin()) return
    const willBlock = !payload.viewer.blocked
    if (willBlock && !window.confirm(`Bloquear @${payload.profile.username}? As obras deste autor deixarão de aparecer para você.`)) return
    setBusy(true)
    const { data, error: blockError } = await supabase.rpc('toggle_user_block', { target_user: payload.profile.id })
    setBusy(false)
    if (blockError) { setMessage('Não foi possível alterar o bloqueio.'); return }
    if (data) {
      setPayload((current) => current ? { ...current, viewer: { ...current.viewer, blocked: true, following: false } } : current)
      setMessage('Autor bloqueado.')
    } else {
      setPayload((current) => current ? { ...current, viewer: { ...current.viewer, blocked: false } } : current)
      setMessage('Bloqueio removido.')
    }
  }

  if (loading) return <><NovaHeader /><main className="profile-page"><div className="studio-loading"><span /><h1>Carregando perfil…</h1></div></main></>
  if (error || !payload) return <><NovaHeader /><main className="profile-page"><div className="profile-not-found"><span>✦</span><h1>{error || 'Perfil não encontrado.'}</h1><p>O usuário pode ter alterado o nome, desativado a conta ou estar indisponível para você.</p><Link className="primary-button" href="/explore">Voltar para explorar</Link></div></main></>

  const { profile, stats, viewer } = payload
  const joined = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))

  return (
    <>
      <NovaHeader />
      <main className="profile-page">
        <section className="profile-cover"><div className="profile-orbit one" /><div className="profile-orbit two" /></section>
        <section className="profile-hero">
          <div className="profile-avatar-large">{(profile.display_name || profile.username).slice(0, 1).toUpperCase()}<i>✦</i></div>
          <div className="profile-identity"><p className="eyebrow">Perfil público</p><h1>{profile.display_name || profile.username}</h1><span>@{profile.username}</span><p className="profile-bio">{profile.bio || 'Este autor ainda não escreveu uma bio.'}</p><small>No Archive Nova desde {joined}.</small></div>
          <div className="profile-actions">
            {viewer.is_self ? <div className="profile-self-actions"><Link className="primary-button large" href="/dashboard">Abrir Creator Studio</Link><Link className="secondary-button large" href="/settings/profile">Editar perfil</Link></div> : <button className={`primary-button large ${viewer.following ? 'following' : ''}`} disabled={busy || viewer.blocked} onClick={toggleFollow}>{viewer.following ? '✓ Seguindo' : '＋ Seguir autor'}</button>}
            {!viewer.is_self && user ? <button className="profile-more-button" type="button" onClick={toggleBlock} disabled={busy}>{viewer.blocked ? 'Desbloquear' : 'Bloquear'}</button> : null}
          </div>
        </section>

        {message ? <div className="profile-message" role="status">{message}</div> : null}

        <section className="profile-stats">
          <div><strong>{formatNumber(stats.works)}</strong><span>obras</span></div>
          <div><strong>{formatNumber(stats.words)}</strong><span>palavras</span></div>
          <div><strong>{formatNumber(stats.hits)}</strong><span>leituras</span></div>
          <div><strong>{formatNumber(stats.kudos)}</strong><span>kudos</span></div>
          <div><strong>{formatNumber(stats.followers)}</strong><span>seguidores</span></div>
        </section>

        <section className="profile-library">
          <header><div><p className="eyebrow">Arquivo de @{profile.username}</p><h2>Histórias publicadas</h2></div><span>{works.length} obra{works.length === 1 ? '' : 's'}</span></header>
          {works.length ? <div className="profile-work-grid">{works.map((work) => <article className="profile-work-card" key={work.id}><div className="profile-work-card-top"><span className="rating-badge">{work.rating === 'GENERAL' ? 'G' : work.rating === 'TEEN' ? 'T' : work.rating === 'MATURE' ? 'M' : work.rating === 'EXPLICIT' ? 'E' : '?'}</span><span>{work.status === 'COMPLETE' ? 'Concluída' : work.status === 'HIATUS' ? 'Hiato' : 'Em andamento'}</span></div><div><Link href={`/works/${work.id}`}><h3>{work.title}</h3></Link><p>{work.summary || 'Sem resumo.'}</p></div><div className="profile-work-tags">{work.fandoms.slice(0,2).map((tag) => <span key={tag}>{tag}</span>)}{work.tags.slice(0,2).map((tag) => <span key={tag}>{tag}</span>)}</div><footer><span>{formatNumber(work.word_count)} palavras</span><span>♥ {formatNumber(work.kudos_count)}</span><span>◌ {formatNumber(work.hits_count)}</span></footer></article>)}</div> : <div className="studio-empty large"><span>✎</span><h2>Nenhuma obra pública ainda</h2><p>Quando @{profile.username} publicar uma história, ela aparecerá aqui.</p></div>}
        </section>
      </main>
    </>
  )
}
