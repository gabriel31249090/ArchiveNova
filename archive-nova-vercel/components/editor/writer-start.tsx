'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { clearLocalWriterDraft, htmlToPlainText, readLocalWriterDraft } from '@/lib/writer-draft'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

type DraftSummary = {
  id: string
  title: string
  revision: number
  created_at: string
  updated_at: string
  chapter_count: number
  word_count: number
  first_chapter_title: string
  daily_word_goal?: number
  weekly_word_goal?: number
  project_word_goal?: number | null
  today_words?: number
  week_words?: number
}

const StoryEditor = dynamic(
  () => import('@/components/editor/story-editor').then((module) => module.StoryEditor),
  {
    ssr: false,
    loading: () => <main className="writer-cloud-loading"><span>✦</span><h1>Abrindo o Writer…</h1><p>Carregando as ferramentas de edição.</p></main>,
  },
)

function formatAgo(value: string) {
  const timestamp = new Date(value).getTime()
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 2) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.round(hours / 24)
  return `há ${days}d`
}

export function WriterStart() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadDrafts = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const { data, error: loadError } = await supabase.rpc('my_writer_drafts')
    if (loadError) {
      console.error(loadError)
      setError('Não foi possível carregar seus rascunhos agora.')
      setDrafts([])
    } else {
      setDrafts(Array.isArray(data) ? data as unknown as DraftSummary[] : [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (!supabase) { setChecking(false); setLoading(false); return }
    void (async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user || null)
      setChecking(false)
      if (data.user) await loadDrafts()
      else setLoading(false)
    })()
  }, [loadDrafts, supabase])

  async function createDraft() {
    if (!supabase || !user || creating) return
    setCreating(true)
    setError('')
    const local = readLocalWriterDraft()
    const words = local ? htmlToPlainText(local.content).split(/\s+/u).filter(Boolean).length : 0
    const { data, error: createError } = await supabase.rpc('create_writer_draft', {
      initial_title: local?.title || '',
      initial_chapter_title: local?.chapterTitle || '',
      initial_content_html: local?.content || '<p></p>',
      initial_content_json: EMPTY_DOC,
      initial_word_count: words,
    })
    if (createError || !data) {
      console.error(createError)
      setCreating(false)
      setError('Não foi possível criar o rascunho. Seu texto local continua seguro.')
      return
    }
    const id = String((data as Record<string, unknown>).id || '')
    if (local) clearLocalWriterDraft()
    if (id) window.location.href = `/write/${id}`
    else {
      setCreating(false)
      setError('O Writer não recebeu o identificador do novo rascunho.')
    }
  }

  if (checking) return <main className="writer-cloud-loading"><span>✦</span><h1>Preparando o Writer…</h1><p>Buscando seu espaço de escrita.</p></main>
  if (!configured || !user) return <StoryEditor />

  const latest = drafts[0]
  const todayWords = drafts.reduce((sum, draft) => sum + Number(draft.today_words || 0), 0)
  const weekWords = drafts.reduce((sum, draft) => sum + Number(draft.week_words || 0), 0)
  const dailyGoal = latest?.daily_word_goal || 1000
  const weeklyGoal = latest?.weekly_word_goal || 5000
  const totalWords = drafts.reduce((sum, draft) => sum + Number(draft.word_count || 0), 0)
  const totalChapters = drafts.reduce((sum, draft) => sum + Number(draft.chapter_count || 0), 0)

  return (
    <main className="writer-home-v49">
      <header className="writer-home-topbar">
        <Link className="writer-brand" href="/"><span>✦</span><strong>Archive Nova</strong></Link>
        <nav><Link href="/dashboard">Creator Studio</Link><Link href="/dashboard/analytics">Analytics</Link><Link href="/dashboard/comments">Comentários</Link></nav>
        <button className="primary-button" type="button" disabled={creating} onClick={() => void createDraft()}>{creating ? 'Criando…' : '+ Novo rascunho'}</button>
      </header>

      <section className="writer-home-hero nova-aurora-surface">
        <div className="writer-home-intro">
          <p className="eyebrow">Writer Home · NovaDrop 03</p>
          <h1>Volte para a história, não para um painel.</h1>
          <p>Rascunhos, metas, planejamento, versões e publicação ficam no mesmo fluxo. O Archive Nova guarda o contexto; você continua escrevendo.</p>
          {latest ? <div className="writer-home-resume"><div><span>CONTINUAR ESCREVENDO</span><strong>{latest.title || 'Obra sem título'}</strong><small>{latest.first_chapter_title || 'Capítulo atual'} · {Number(latest.word_count || 0).toLocaleString('pt-BR')} palavras · {formatAgo(latest.updated_at)}</small></div><Link className="primary-button large" href={`/write/${latest.id}`}>Continuar →</Link></div> : <button className="primary-button large" type="button" onClick={() => void createDraft()}>Começar a primeira história →</button>}
        </div>
        <div className="writer-home-pulse">
          <article><span>Hoje</span><strong>{todayWords.toLocaleString('pt-BR')}</strong><small>de {dailyGoal.toLocaleString('pt-BR')} palavras</small><i><b style={{ width: `${Math.min(100, dailyGoal ? (todayWords / dailyGoal) * 100 : 0)}%` }} /></i></article>
          <article><span>Últimos 7 dias</span><strong>{weekWords.toLocaleString('pt-BR')}</strong><small>de {weeklyGoal.toLocaleString('pt-BR')} palavras</small><i><b style={{ width: `${Math.min(100, weeklyGoal ? (weekWords / weeklyGoal) * 100 : 0)}%` }} /></i></article>
          <div className="writer-home-mini-stats"><span><b>{drafts.length}</b> rascunhos</span><span><b>{totalChapters}</b> capítulos</span><span><b>{totalWords.toLocaleString('pt-BR')}</b> palavras</span></div>
        </div>
      </section>

      {error ? <div className="writer-home-error" role="alert">{error}</div> : null}

      <section className="writer-home-tools">
        <Link href="/dashboard/analytics"><span>↗</span><div><strong>Analytics do escritor</strong><small>Retenção, leituras e origem do tráfego.</small></div></Link>
        <Link href="/dashboard/comments"><span>☵</span><div><strong>Central de comentários</strong><small>Responda leitores sem caçar capítulo por capítulo.</small></div></Link>
        <Link href="/dashboard"><span>⌘</span><div><strong>Creator Studio</strong><small>Obras publicadas, biblioteca e gerenciamento.</small></div></Link>
      </section>

      <section className="writer-home-drafts">
        <header><div><p className="eyebrow">Seus projetos</p><h2>Rascunhos</h2></div><button className="secondary-button" type="button" onClick={() => void loadDrafts()}>Atualizar</button></header>
        {loading ? <div className="studio-loading"><span /><h2>Carregando seus projetos…</h2></div> : drafts.length ? <div className="writer-home-draft-grid">{drafts.map((draft) => {
          const goal = Number(draft.project_word_goal || 0)
          const progress = goal ? Math.min(100, Number(draft.word_count || 0) / goal * 100) : 0
          return <article key={draft.id} className="nova-spotlight-card"><div className="writer-home-draft-head"><span>{Number(draft.chapter_count || 0)} CAP.</span><small>{formatAgo(draft.updated_at)}</small></div><h3>{draft.title || 'Obra sem título'}</h3><p>{draft.first_chapter_title || 'Primeiro capítulo ainda sem título'}</p><dl><div><dt>Palavras</dt><dd>{Number(draft.word_count || 0).toLocaleString('pt-BR')}</dd></div><div><dt>Hoje</dt><dd>+{Number(draft.today_words || 0).toLocaleString('pt-BR')}</dd></div></dl>{goal ? <div className="writer-home-project-progress"><span><b>Meta do projeto</b><small>{Math.round(progress)}%</small></span><i><b style={{ width: `${progress}%` }} /></i></div> : null}<div className="writer-home-draft-actions"><Link className="primary-button" href={`/write/${draft.id}`}>Escrever</Link><Link className="ghost-button" href={`/publish/${draft.id}`}>Publicar</Link></div></article>
        })}</div> : <div className="writer-home-empty"><span>✎</span><h2>Seu próximo projeto começa aqui.</h2><p>Nenhum rascunho na nuvem ainda.</p><button className="primary-button" type="button" onClick={() => void createDraft()}>Criar rascunho</button></div>}
      </section>
    </main>
  )
}
