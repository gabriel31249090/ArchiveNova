'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { WorkCardData } from '@/lib/types'

function normalizeWork(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''), creator_id: String(row.creator_id || ''), title: String(row.title || ''), summary: String(row.summary || ''),
    rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'], status: String(row.status || 'ONGOING') as WorkCardData['status'],
    visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'], language: String(row.language || 'pt-BR'),
    expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters), word_count: Number(row.word_count || 0), chapter_count: Number(row.chapter_count || 0),
    kudos_count: Number(row.kudos_count || 0), bookmarks_count: Number(row.bookmarks_count || 0), comments_count: Number(row.comments_count || 0), hits_count: Number(row.hits_count || 0),
    allow_comments: Boolean(row.allow_comments), published_at: row.published_at ? String(row.published_at) : null, updated_at: String(row.updated_at || ''), created_at: String(row.created_at || ''),
    author_username: String(row.author_username || ''), author_display_name: String(row.author_display_name || row.author_username || ''),
    fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [], tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  }
}

export function MyWorksDashboard() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [works, setWorks] = useState<WorkCardData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    const client = supabase
    void (async () => {
      const { data: authData } = await client.auth.getUser()
      const currentUser = authData.user || null
      setUser(currentUser)
      if (!currentUser) { setLoading(false); return }
      const { data, error } = await client.from('public_work_cards').select('*').eq('creator_id', currentUser.id).order('updated_at', { ascending: false })
      if (error) console.error(error)
      setWorks(((data || []) as Record<string, unknown>[]).map(normalizeWork))
      setLoading(false)
    })()
  }, [supabase])

  if (loading) return <main className="manage-page"><div className="manage-gate"><span className="publish-loader" /><h1>Carregando suas obras…</h1></div></main>
  if (!user) return <main className="manage-page"><div className="manage-gate"><p className="eyebrow">Suas obras</p><h1>Entre para gerenciar o que você publicou.</h1><Link className="primary-button large" href="/explore?auth=login&return=/dashboard/works">Entrar</Link></div></main>

  return (
    <main className="manage-page">
      <header className="manage-topbar"><Link className="publish-brand" href="/"><span>✦</span><strong>Archive Nova</strong></Link><div className="manage-breadcrumb"><strong>Minhas obras</strong></div><div className="manage-top-actions"><Link href="/explore">Explorar</Link><Link className="primary-button" href="/write">＋ Nova obra</Link></div></header>
      <div className="my-works-shell">
        <div className="my-works-head"><div><p className="eyebrow">Painel do autor</p><h1>Minhas obras</h1><p>Edite informações, capítulos e configurações das histórias que você publicou.</p></div><Link className="primary-button large" href="/write">Começar uma história</Link></div>
        {works.length ? <div className="my-works-grid">{works.map((work) => (
          <article className="my-work-card" key={work.id}>
            <div className="my-work-card-top"><span className="rating-badge">{work.rating === 'GENERAL' ? 'G' : work.rating === 'TEEN' ? 'T' : work.rating === 'MATURE' ? 'M' : work.rating === 'EXPLICIT' ? 'E' : '?'}</span><span className={`work-status-pill ${work.status.toLowerCase()}`}>{work.status === 'ONGOING' ? 'Em andamento' : work.status === 'COMPLETE' ? 'Concluída' : work.status === 'HIATUS' ? 'Hiato' : 'Rascunho'}</span></div>
            <div><h2>{work.title}</h2><p>{work.summary || 'Sem resumo.'}</p></div>
            <div className="publish-review-tags">{work.fandoms.slice(0, 2).map((fandom) => <span className="primary" key={fandom}>{fandom}</span>)}{work.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="my-work-stats"><span><strong>{work.chapter_count}</strong> capítulos</span><span><strong>{work.word_count.toLocaleString('pt-BR')}</strong> palavras</span><span><strong>{work.hits_count.toLocaleString('pt-BR')}</strong> leituras</span><span><strong>{work.kudos_count.toLocaleString('pt-BR')}</strong> kudos</span></div>
            <div className="my-work-actions"><Link className="ghost-button" href={`/explore?work=${work.id}`}>Visualizar</Link><Link className="primary-button" href={`/works/${work.id}/manage`}>Gerenciar →</Link></div>
          </article>
        ))}</div> : <div className="manage-empty"><span>✎</span><h2>Você ainda não publicou nenhuma obra.</h2><p>Escreva no Archive Nova Writer e publique quando estiver pronta.</p><Link className="primary-button" href="/write">Começar a escrever</Link></div>}
      </div>
    </main>
  )
}
