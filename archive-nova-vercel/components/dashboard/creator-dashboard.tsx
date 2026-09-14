'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { CreatorDashboardTotals, CreatorRecentComment, WorkCardData } from '@/lib/types'

function normalizeWork(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''), creator_id: String(row.creator_id || ''), title: String(row.title || ''), summary: String(row.summary || ''),
    rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'], status: String(row.status || 'ONGOING') as WorkCardData['status'],
    visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'], language: String(row.language || 'pt-BR'), expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters),
    word_count: Number(row.word_count || 0), chapter_count: Number(row.chapter_count || 0), kudos_count: Number(row.kudos_count || 0), bookmarks_count: Number(row.bookmarks_count || 0), comments_count: Number(row.comments_count || 0), hits_count: Number(row.hits_count || 0), allow_comments: Boolean(row.allow_comments),
    published_at: row.published_at ? String(row.published_at) : null, updated_at: String(row.updated_at || ''), created_at: String(row.created_at || ''), author_username: String(row.author_username || ''), author_display_name: String(row.author_display_name || row.author_username || ''), fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [], tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  }
}

const ZERO_TOTALS: CreatorDashboardTotals = { works: 0, published: 0, ongoing: 0, complete: 0, drafts: 0, words: 0, hits: 0, kudos: 0, bookmarks: 0, comments: 0, followers: 0, subscribers: 0, unread_notifications: 0 }

function fmt(value: number) { return new Intl.NumberFormat('pt-BR', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value || 0) }
function date(value: string) { return value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—' }
function statusLabel(value: WorkCardData['status']) { return value === 'COMPLETE' ? 'Concluída' : value === 'HIATUS' ? 'Hiato' : value === 'DRAFT' ? 'Rascunho' : 'Em andamento' }

export function CreatorDashboard() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [totals, setTotals] = useState<CreatorDashboardTotals>(ZERO_TOTALS)
  const [works, setWorks] = useState<WorkCardData[]>([])
  const [topWorks, setTopWorks] = useState<WorkCardData[]>([])
  const [comments, setComments] = useState<CreatorRecentComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'overview' | 'works' | 'activity'>('overview')
  const [filter, setFilter] = useState<'ALL' | WorkCardData['status']>('ALL')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!supabase) { setLoading(false); setError('Supabase não configurado.'); return }
    const client = supabase
    void (async () => {
      const { data: authData } = await client.auth.getUser()
      const current = authData.user || null
      setUser(current)
      if (!current) { setLoading(false); return }

      const [profileResponse, dashboardResponse] = await Promise.all([
        client.from('profiles').select('username,display_name').eq('id', current.id).maybeSingle(),
        client.rpc('creator_dashboard'),
      ])
      if (profileResponse.data) {
        const profile = profileResponse.data as { username: string; display_name: string | null }
        setUsername(profile.username)
        setDisplayName(profile.display_name || profile.username)
      }
      if (dashboardResponse.error) {
        console.error(dashboardResponse.error)
        setError('Não foi possível carregar o Creator Studio. Execute a migration das Fases 6–8 no Supabase.')
        setLoading(false)
        return
      }
      const data = (dashboardResponse.data || {}) as Record<string, unknown>
      const rawTotals = (data.totals || {}) as Record<string, unknown>
      setTotals(Object.fromEntries(Object.keys(ZERO_TOTALS).map((key) => [key, Number(rawTotals[key] || 0)])) as unknown as CreatorDashboardTotals)
      setWorks(((data.works || []) as Record<string, unknown>[]).map(normalizeWork))
      setTopWorks(((data.top_works || []) as Record<string, unknown>[]).map(normalizeWork))
      setComments(((data.recent_comments || []) as Record<string, unknown>[]).map((item) => ({
        id: String(item.id || ''), body: String(item.body || ''), created_at: String(item.created_at || ''), chapter_id: String(item.chapter_id || ''), chapter_number: Number(item.chapter_number || 0), chapter_title: item.chapter_title == null ? null : String(item.chapter_title), work_id: String(item.work_id || ''), work_title: String(item.work_title || ''), user_id: String(item.user_id || ''), username: String(item.username || ''), display_name: String(item.display_name || item.username || ''),
      })))
      setLoading(false)
    })()
  }, [supabase])

  const filteredWorks = useMemo(() => works.filter((work) => {
    const matchesFilter = filter === 'ALL' || work.status === filter
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    const matchesQuery = !needle || `${work.title} ${work.summary} ${work.fandoms.join(' ')} ${work.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(needle)
    return matchesFilter && matchesQuery
  }), [works, filter, query])

  if (loading) return <><NovaHeader title="Creator Studio" /><main className="studio-page"><div className="studio-loading"><span /><h1>Preparando seu Studio…</h1><p>Carregando obras, métricas e atividade.</p></div></main></>
  if (!user) return <><NovaHeader title="Creator Studio" /><main className="studio-page"><div className="studio-gate"><span>✦</span><p className="eyebrow">Creator Studio</p><h1>Seu espaço para escrever, publicar e acompanhar suas histórias.</h1><p>Entre na sua conta para abrir o painel do autor.</p><Link className="primary-button large" href="/explore?auth=login&return=/dashboard">Entrar no Archive Nova</Link></div></main></>

  return (
    <>
      <NovaHeader title="Creator Studio" />
      <main className="studio-page">
        <section className="studio-hero">
          <div><p className="eyebrow">Creator Studio</p><h1>Olá, {displayName || username}.</h1><p>Seu arquivo criativo, suas métricas e tudo que precisa de atenção em um só lugar.</p></div>
          <div className="studio-hero-actions"><Link className="secondary-button" href={`/users/${encodeURIComponent(username)}`}>Ver perfil público</Link><Link className="primary-button large" href="/write">＋ Nova história</Link></div>
        </section>

        {error ? <div className="studio-alert error">{error}</div> : null}

        <nav className="studio-tabs" aria-label="Seções do Studio">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Visão geral</button>
          <button className={tab === 'works' ? 'active' : ''} onClick={() => setTab('works')}>Minhas obras <span>{totals.works}</span></button>
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Atividade <span>{totals.unread_notifications}</span></button>
        </nav>

        {tab === 'overview' ? (
          <div className="studio-section-stack">
            <section className="studio-metric-grid">
              <article className="studio-metric primary"><span>Obras</span><strong>{fmt(totals.works)}</strong><small>{totals.ongoing} em andamento · {totals.complete} concluídas</small></article>
              <article className="studio-metric"><span>Palavras</span><strong>{fmt(totals.words)}</strong><small>em todas as suas obras</small></article>
              <article className="studio-metric"><span>Leituras</span><strong>{fmt(totals.hits)}</strong><small>visualizações acumuladas</small></article>
              <article className="studio-metric"><span>Kudos</span><strong>{fmt(totals.kudos)}</strong><small>{fmt(totals.bookmarks)} bookmarks</small></article>
              <article className="studio-metric"><span>Comentários</span><strong>{fmt(totals.comments)}</strong><small>interações de leitores</small></article>
              <article className="studio-metric"><span>Seguidores</span><strong>{fmt(totals.followers)}</strong><small>{fmt(totals.subscribers)} inscrições em obras</small></article>
            </section>

            <section className="studio-grid-2">
              <div className="studio-panel">
                <header><div><p className="eyebrow">Performance</p><h2>Obras em destaque</h2></div><button className="text-button" onClick={() => setTab('works')}>Ver todas →</button></header>
                {topWorks.length ? <div className="studio-ranking">{topWorks.map((work, index) => <article key={work.id}><b>{String(index + 1).padStart(2, '0')}</b><div><Link href={`/works/${work.id}`}>{work.title}</Link><small>{fmt(work.hits_count)} leituras · {fmt(work.kudos_count)} kudos · {fmt(work.comments_count)} comentários</small></div><Link className="studio-mini-action" href={`/works/${work.id}/manage`}>Gerenciar</Link></article>)}</div> : <div className="studio-empty"><span>✎</span><p>Publique uma obra para começar a acompanhar seu desempenho.</p></div>}
              </div>

              <div className="studio-panel">
                <header><div><p className="eyebrow">Agora</p><h2>Atividade recente</h2></div><Link className="text-button" href="/notifications">Notificações →</Link></header>
                {comments.length ? <div className="studio-comment-feed">{comments.slice(0, 5).map((comment) => <article key={comment.id}><Link className="studio-avatar" href={`/users/${encodeURIComponent(comment.username)}`}>{comment.display_name.slice(0, 1).toUpperCase()}</Link><div><p><strong>{comment.display_name}</strong> comentou em <Link href={`/works/${comment.work_id}`}>{comment.work_title}</Link></p><blockquote>{comment.body}</blockquote><small>{date(comment.created_at)}</small></div></article>)}</div> : <div className="studio-empty"><span>☁</span><p>Quando leitores comentarem suas histórias, a atividade aparecerá aqui.</p></div>}
              </div>
            </section>

            <section className="studio-quick-actions">
              <Link href="/write"><span>✎</span><div><strong>Escrever</strong><small>Começar uma nova história</small></div><b>→</b></Link>
              <button onClick={() => setTab('works')}><span>☷</span><div><strong>Gerenciar obras</strong><small>Editar capítulos e publicação</small></div><b>→</b></button>
              <Link href="/notifications"><span>♢</span><div><strong>Ver atividade</strong><small>{totals.unread_notifications ? `${totals.unread_notifications} não lidas` : 'Tudo em dia'}</small></div><b>→</b></Link>
            </section>
          </div>
        ) : null}

        {tab === 'works' ? (
          <section className="studio-works-section">
            <div className="studio-works-toolbar">
              <div className="studio-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nas suas obras…" /></div>
              <div className="studio-filter-row">{([['ALL','Todas'],['ONGOING','Em andamento'],['COMPLETE','Concluídas'],['HIATUS','Hiato'],['DRAFT','Rascunhos']] as const).map(([value,label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
            </div>
            {filteredWorks.length ? <div className="studio-work-list">{filteredWorks.map((work) => <article key={work.id} className="studio-work-row"><div className="studio-work-rating">{work.rating === 'GENERAL' ? 'G' : work.rating === 'TEEN' ? 'T' : work.rating === 'MATURE' ? 'M' : work.rating === 'EXPLICIT' ? 'E' : '?'}</div><div className="studio-work-copy"><div className="studio-work-title"><Link href={`/works/${work.id}`}>{work.title}</Link><span className={`studio-status ${work.status.toLowerCase()}`}>{statusLabel(work.status)}</span></div><p>{work.summary || 'Sem resumo.'}</p><div className="studio-work-tags">{work.fandoms.slice(0,2).map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="studio-work-numbers"><span><strong>{fmt(work.word_count)}</strong> palavras</span><span><strong>{fmt(work.hits_count)}</strong> leituras</span><span><strong>{fmt(work.kudos_count)}</strong> kudos</span><span><strong>{work.chapter_count}{work.expected_chapters ? `/${work.expected_chapters}` : ''}</strong> capítulos</span></div><div className="studio-work-actions"><small>Atualizada {date(work.updated_at)}</small><Link className="secondary-button" href={`/works/${work.id}/manage`}>Gerenciar</Link></div></article>)}</div> : <div className="studio-empty large"><span>⌕</span><h2>Nenhuma obra encontrada</h2><p>Tente outro filtro ou comece uma nova história.</p><Link className="primary-button" href="/write">Nova história</Link></div>}
          </section>
        ) : null}

        {tab === 'activity' ? (
          <section className="studio-activity-section">
            <div className="studio-panel activity-large"><header><div><p className="eyebrow">Comentários</p><h2>Conversas nas suas histórias</h2><p>Os comentários mais recentes de todas as suas obras.</p></div><Link className="primary-button" href="/notifications">Central de notificações</Link></header>{comments.length ? <div className="studio-comment-feed expanded">{comments.map((comment) => <article key={comment.id}><Link className="studio-avatar" href={`/users/${encodeURIComponent(comment.username)}`}>{comment.display_name.slice(0,1).toUpperCase()}</Link><div><p><strong>{comment.display_name}</strong> · <Link href={`/works/${comment.work_id}`}>{comment.work_title}</Link> · capítulo {comment.chapter_number}</p><blockquote>{comment.body}</blockquote><small>{date(comment.created_at)}</small></div></article>)}</div> : <div className="studio-empty"><span>☁</span><p>Ainda não há comentários recentes.</p></div>}</div>
          </section>
        ) : null}
      </main>
    </>
  )
}
