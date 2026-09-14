'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { RichTextField } from '@/components/editor/rich-text-field'
import { TaxonomyPicker } from '@/components/taxonomy/taxonomy-picker'
import { sanitizeStoryHtml } from '@/lib/writer-draft'
import type { Chapter, WorkCardData } from '@/lib/types'

function normalizeWork(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''),
    creator_id: String(row.creator_id || ''),
    title: String(row.title || ''),
    summary: String(row.summary || ''),
    rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'],
    status: String(row.status || 'ONGOING') as WorkCardData['status'],
    visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'],
    language: String(row.language || 'pt-BR'),
    expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters),
    word_count: Number(row.word_count || 0),
    chapter_count: Number(row.chapter_count || 0),
    kudos_count: Number(row.kudos_count || 0),
    bookmarks_count: Number(row.bookmarks_count || 0),
    comments_count: Number(row.comments_count || 0),
    hits_count: Number(row.hits_count || 0),
    allow_comments: Boolean(row.allow_comments),
    published_at: row.published_at ? String(row.published_at) : null,
    updated_at: String(row.updated_at || ''),
    created_at: String(row.created_at || ''),
    author_username: String(row.author_username || ''),
    author_display_name: String(row.author_display_name || row.author_username || ''),
    fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [],
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    allow_contributions: Boolean(row.allow_contributions),
  }
}

function normalizeChapter(row: Record<string, unknown>): Chapter {
  return {
    id: String(row.id || ''),
    work_id: String(row.work_id || ''),
    chapter_number: Number(row.chapter_number || 0),
    title: row.title == null ? null : String(row.title),
    content: String(row.content || ''),
    notes_before: row.notes_before == null ? null : String(row.notes_before),
    notes_after: row.notes_after == null ? null : String(row.notes_after),
    word_count: Number(row.word_count || 0),
    status: String(row.status || 'PUBLISHED') as Chapter['status'],
    published_at: row.published_at == null ? null : String(row.published_at),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function chapterLabel(chapter: Chapter) {
  return chapter.title?.trim() || `Capítulo ${chapter.chapter_number}`
}

export function WorkManager({ workId }: { workId: string }) {
  const router = useRouter()
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [work, setWork] = useState<WorkCardData | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [tab, setTab] = useState<'overview' | 'chapters' | 'danger'>('overview')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [rating, setRating] = useState('GENERAL')
  const [status, setStatus] = useState('ONGOING')
  const [visibility, setVisibility] = useState('PUBLIC')
  const [language, setLanguage] = useState('pt-BR')
  const [expected, setExpected] = useState('')
  const [allowComments, setAllowComments] = useState(true)
  const [fandoms, setFandoms] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [deleteConfirmation, setDeleteConfirmation] = useState('')

  const [newChapterOpen, setNewChapterOpen] = useState(false)
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newChapterContent, setNewChapterContent] = useState('<p></p>')
  const [newChapterStatus, setNewChapterStatus] = useState<'PUBLISHED' | 'DRAFT'>('PUBLISHED')

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    const client = supabase
    setLoading(true)
    setError('')

    const { data: authData } = await client.auth.getUser()
    const currentUser = authData.user || null
    setUser(currentUser)
    if (!currentUser) {
      setLoading(false)
      return
    }

    const [workResponse, chaptersResponse] = await Promise.all([
      client.from('public_work_cards').select('*').eq('id', workId).maybeSingle(),
      client.from('chapters').select('*').eq('work_id', workId).order('chapter_number', { ascending: true }),
    ])

    if (workResponse.error) {
      console.error(workResponse.error)
      setError('Não foi possível carregar essa obra.')
      setLoading(false)
      return
    }
    if (!workResponse.data) {
      setError('Obra não encontrada ou sem permissão para gerenciá-la.')
      setLoading(false)
      return
    }

    const normalized = normalizeWork(workResponse.data as Record<string, unknown>)
    if (normalized.creator_id !== currentUser.id) {
      setError('Somente o autor pode gerenciar esta obra.')
      setLoading(false)
      return
    }

    const normalizedChapters = ((chaptersResponse.data || []) as Record<string, unknown>[]).map(normalizeChapter)
    setWork(normalized)
    setChapters(normalizedChapters)
    setTitle(normalized.title)
    setSummary(normalized.summary)
    setRating(normalized.rating)
    setStatus(normalized.status)
    setVisibility(normalized.visibility)
    setLanguage(normalized.language)
    setExpected(normalized.expected_chapters ? String(normalized.expected_chapters) : '')
    setAllowComments(normalized.allow_comments)
    setFandoms(normalized.fandoms)
    setTags(normalized.tags)
    setLoading(false)
  }, [supabase, workId])

  useEffect(() => { void load() }, [load])

  const notify = (value: string) => {
    setMessage(value)
    window.setTimeout(() => setMessage((current) => current === value ? '' : current), 3200)
  }

  async function saveOverview() {
    if (!supabase || !work) return
    if (!title.trim()) return setError('O título da obra é obrigatório.')
    if (!fandoms.length) return setError('A obra precisa ter pelo menos um fandom.')

    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.rpc('update_work', {
      target_work: work.id,
      work_title: title.trim(),
      work_summary: summary.trim(),
      work_rating: rating,
      work_status: status,
      work_visibility: visibility,
      fandom_names: fandoms,
      tag_names: tags,
      expected_chapter_count: expected ? Number(expected) : null,
      work_language: language,
      allow_comments_input: allowComments,
    })
    setBusy(false)

    if (updateError) {
      console.error(updateError)
      setError(updateError.message || 'Não foi possível salvar a obra. A migration da Fase 3 foi executada no Supabase?')
      return
    }
    await load()
    notify('Alterações da obra salvas.')
  }

  async function saveChapter(chapter: Chapter) {
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.rpc('update_chapter', {
      target_chapter: chapter.id,
      chapter_title: chapter.title || null,
      chapter_content: sanitizeStoryHtml(chapter.content),
      chapter_status: chapter.status,
      notes_before_input: chapter.notes_before || null,
      notes_after_input: chapter.notes_after || null,
    })
    setBusy(false)
    if (updateError) {
      console.error(updateError)
      setError(updateError.message || 'Não foi possível salvar o capítulo.')
      return
    }
    await load()
    notify(`${chapterLabel(chapter)} salvo.`)
  }

  async function removeChapter(chapter: Chapter) {
    if (!supabase) return
    if (!window.confirm(`Excluir “${chapterLabel(chapter)}”? Comentários desse capítulo também serão excluídos.`)) return
    setBusy(true)
    setError('')
    const { error: deleteError } = await supabase.rpc('delete_chapter', { target_chapter: chapter.id })
    setBusy(false)
    if (deleteError) {
      console.error(deleteError)
      setError(deleteError.message || 'Não foi possível excluir o capítulo.')
      return
    }
    await load()
    notify('Capítulo excluído.')
  }

  async function moveChapter(index: number, direction: -1 | 1) {
    if (!supabase || !work) return
    const target = index + direction
    if (target < 0 || target >= chapters.length) return
    const next = [...chapters]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setChapters(next.map((chapter, idx) => ({ ...chapter, chapter_number: idx + 1 })))

    const { error: reorderError } = await supabase.rpc('reorder_chapters', {
      target_work: work.id,
      ordered_chapter_ids: next.map((chapter) => chapter.id),
    })
    if (reorderError) {
      console.error(reorderError)
      setError(reorderError.message || 'Não foi possível reordenar os capítulos.')
      await load()
      return
    }
    notify('Ordem dos capítulos atualizada.')
  }

  async function addChapter() {
    if (!supabase || !work) return
    const plain = newChapterContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!plain) return setError('Escreva o conteúdo do novo capítulo.')

    setBusy(true)
    setError('')
    const { error: chapterError } = await supabase.rpc('add_chapter', {
      target_work: work.id,
      chapter_title: newChapterTitle.trim() || null,
      chapter_content: sanitizeStoryHtml(newChapterContent),
      publish_now: newChapterStatus === 'PUBLISHED',
    })
    setBusy(false)
    if (chapterError) {
      console.error(chapterError)
      setError(chapterError.message || 'Não foi possível adicionar o capítulo.')
      return
    }
    setNewChapterTitle('')
    setNewChapterContent('<p></p>')
    setNewChapterStatus('PUBLISHED')
    setNewChapterOpen(false)
    await load()
    notify('Novo capítulo adicionado.')
  }

  async function removeWork() {
    if (!supabase || !work) return
    if (deleteConfirmation !== work.title) return setError('Digite o título exato da obra para confirmar.')
    if (!window.confirm('Esta obra será removida do ArchiveNova. Continuar?')) return
    setBusy(true)
    const { error: deleteError } = await supabase.rpc('delete_work', { target_work: work.id })
    setBusy(false)
    if (deleteError) {
      console.error(deleteError)
      setError(deleteError.message || 'Não foi possível excluir a obra.')
      return
    }
    router.push('/explore')
  }

  const updateChapterLocal = (id: string, patch: Partial<Chapter>) => {
    setChapters((current) => current.map((chapter) => chapter.id === id ? { ...chapter, ...patch } : chapter))
  }

  if (!configured) return <main className="manage-page"><div className="manage-gate"><h1>Supabase não configurado.</h1></div></main>
  if (loading) return <main className="manage-page"><div className="manage-gate"><span className="publish-loader" /><h1>Carregando sua obra…</h1></div></main>
  if (!user) return <main className="manage-page"><div className="manage-gate"><p className="eyebrow">Gerenciamento</p><h1>Entre para editar sua obra.</h1><Link className="primary-button large" href={`/explore?auth=login&return=/works/${workId}/manage`}>Entrar</Link></div></main>
  if (!work) return <main className="manage-page"><div className="manage-gate"><p className="eyebrow">Gerenciamento</p><h1>{error || 'Obra não encontrada.'}</h1><Link className="ghost-button large" href="/explore">Voltar</Link></div></main>

  return (
    <main className="manage-page">
      <header className="manage-topbar">
        <Link className="publish-brand" href="/"><span>✦</span><strong>Archive Nova</strong></Link>
        <div className="manage-breadcrumb"><Link href="/dashboard">Creator Studio</Link><b>/</b><strong>{work.title}</strong></div>
        <div className="manage-top-actions"><Link href={`/works/${work.id}`}>Ver obra</Link><Link href={`/works/${work.id}/contribute`}>⑂ Colaboração</Link><Link className="primary-button" href="/write">＋ Escrever</Link></div>
      </header>

      <div className="manage-shell">
        <aside className="manage-sidebar">
          <div className="manage-work-heading"><span className="rating-badge">{work.rating === 'GENERAL' ? 'G' : work.rating === 'TEEN' ? 'T' : work.rating === 'MATURE' ? 'M' : work.rating === 'EXPLICIT' ? 'E' : '?'}</span><div><strong>{work.title}</strong><small>{work.chapter_count} cap. · {work.word_count.toLocaleString('pt-BR')} palavras</small></div></div>
          <nav>
            <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><span>⌘</span><div><strong>Visão geral</strong><small>Metadados e publicação</small></div></button>
            <button className={tab === 'chapters' ? 'active' : ''} onClick={() => setTab('chapters')}><span>☷</span><div><strong>Capítulos</strong><small>Editar, ordenar e excluir</small></div></button>
            <button className={tab === 'danger' ? 'active danger' : 'danger'} onClick={() => setTab('danger')}><span>⚠</span><div><strong>Zona de perigo</strong><small>Excluir obra</small></div></button>
          </nav>
          <div className="manage-stats"><div><strong>{work.hits_count.toLocaleString('pt-BR')}</strong><span>leituras</span></div><div><strong>{work.kudos_count.toLocaleString('pt-BR')}</strong><span>kudos</span></div><div><strong>{work.bookmarks_count.toLocaleString('pt-BR')}</strong><span>salvos</span></div><div><strong>{work.comments_count.toLocaleString('pt-BR')}</strong><span>comentários</span></div></div>
        </aside>

        <section className="manage-content">
          {tab === 'overview' ? (
            <div className="manage-section">
              <div className="manage-section-head"><div><p className="eyebrow">Obra</p><h1>Editar informações</h1><p>Tudo aqui pode ser atualizado mesmo depois da publicação.</p></div><button className="primary-button" disabled={busy} onClick={saveOverview}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
              <div className="manage-card manage-form-grid">
                <label className="span-2">Título<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} /></label>
                <label className="span-2">Resumo<textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={20000} rows={7} /></label>
                <label>Classificação<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="GENERAL">Livre</option><option value="TEEN">Teen</option><option value="MATURE">Mature</option><option value="EXPLICIT">Explicit</option><option value="NOT_RATED">Não classificada</option></select></label>
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ONGOING">Em andamento</option><option value="COMPLETE">Concluída</option><option value="HIATUS">Em hiato</option><option value="DRAFT">Rascunho privado</option></select></label>
                <label>Visibilidade<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">Pública</option><option value="REGISTERED">Somente usuários</option><option value="UNLISTED">Não listada</option><option value="PRIVATE">Privada</option></select></label>
                <label>Capítulos planejados<input value={expected} onChange={(event) => setExpected(event.target.value)} type="number" min="1" placeholder="Opcional" /></label>
                <label>Idioma<select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="pt-BR">Português (Brasil)</option><option value="en">English</option><option value="es">Español</option></select></label>
                <label className="manage-check"><input type="checkbox" checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} /><span><strong>Comentários</strong><small>Permitir comentários nos capítulos.</small></span></label>
              </div>
              <div className="manage-card manage-collab-shortcut"><div><p className="eyebrow">Colaboração</p><h2>Contribuições da comunidade</h2><p>{work.allow_contributions ? 'Esta obra está aberta para propostas de capítulos e edições.' : 'As contribuições estão fechadas no momento.'}</p></div><Link className="secondary-button" href={`/works/${work.id}/contribute`}>Gerenciar contribuições →</Link></div>
              <div className="manage-card manage-taxonomy"><TaxonomyPicker kind="fandoms" label="Fandoms" values={fandoms} onChange={setFandoms} required placeholder="Adicionar fandom" /><TaxonomyPicker kind="tags" label="Tags" values={tags} onChange={setTags} placeholder="Adicionar tag" /></div>
            </div>
          ) : null}

          {tab === 'chapters' ? (
            <div className="manage-section">
              <div className="manage-section-head"><div><p className="eyebrow">Estrutura</p><h1>Capítulos</h1><p>Edite o texto publicado, altere o status, reordene ou remova capítulos.</p></div><button className="primary-button" onClick={() => setNewChapterOpen((value) => !value)}>＋ Novo capítulo</button></div>

              {newChapterOpen ? <div className="manage-card new-chapter-card"><div className="chapter-editor-head"><div><span>NOVO</span><input value={newChapterTitle} onChange={(event) => setNewChapterTitle(event.target.value)} placeholder="Título do capítulo (opcional)" maxLength={300} /></div><select value={newChapterStatus} onChange={(event) => setNewChapterStatus(event.target.value as 'PUBLISHED' | 'DRAFT')}><option value="PUBLISHED">Publicar agora</option><option value="DRAFT">Salvar como rascunho</option></select></div><RichTextField value={newChapterContent} onChange={setNewChapterContent} placeholder="Escreva o novo capítulo…" minHeight={360} /><div className="chapter-card-actions"><button className="ghost-button" onClick={() => setNewChapterOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={addChapter}>Adicionar capítulo</button></div></div> : null}

              <div className="chapter-manager-list">
                {chapters.length ? chapters.map((chapter, index) => (
                  <details className="chapter-manager-card" key={chapter.id} open={index === 0}>
                    <summary>
                      <div className="chapter-order"><strong>{String(chapter.chapter_number).padStart(2, '0')}</strong><div><b>{chapterLabel(chapter)}</b><small>{chapter.word_count.toLocaleString('pt-BR')} palavras · {chapter.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'}</small></div></div>
                      <div className="chapter-order-actions" onClick={(event) => event.preventDefault()}><button type="button" disabled={index === 0 || busy} onClick={() => void moveChapter(index, -1)}>↑</button><button type="button" disabled={index === chapters.length - 1 || busy} onClick={() => void moveChapter(index, 1)}>↓</button></div>
                    </summary>
                    <div className="chapter-manager-body">
                      <div className="manage-form-grid compact">
                        <label className="span-2">Título<input value={chapter.title || ''} onChange={(event) => updateChapterLocal(chapter.id, { title: event.target.value })} maxLength={300} placeholder={`Capítulo ${chapter.chapter_number}`} /></label>
                        <label>Status<select value={chapter.status} onChange={(event) => updateChapterLocal(chapter.id, { status: event.target.value as Chapter['status'] })}><option value="PUBLISHED">Publicado</option><option value="DRAFT">Rascunho</option></select></label>
                        <label>Nota antes do capítulo<textarea value={chapter.notes_before || ''} onChange={(event) => updateChapterLocal(chapter.id, { notes_before: event.target.value })} rows={3} /></label>
                        <label>Nota depois do capítulo<textarea value={chapter.notes_after || ''} onChange={(event) => updateChapterLocal(chapter.id, { notes_after: event.target.value })} rows={3} /></label>
                      </div>
                      <RichTextField value={chapter.content} onChange={(content) => updateChapterLocal(chapter.id, { content })} placeholder="Conteúdo do capítulo…" minHeight={440} />
                      <div className="chapter-card-actions"><button className="danger-button" disabled={busy} onClick={() => void removeChapter(chapter)}>Excluir capítulo</button><button className="primary-button" disabled={busy} onClick={() => void saveChapter(chapter)}>Salvar capítulo</button></div>
                    </div>
                  </details>
                )) : <div className="manage-empty"><span>☷</span><h2>Nenhum capítulo</h2><p>Adicione o primeiro capítulo para continuar a obra.</p></div>}
              </div>
            </div>
          ) : null}

          {tab === 'danger' ? (
            <div className="manage-section danger-section">
              <div className="manage-section-head"><div><p className="eyebrow">Zona de perigo</p><h1>Excluir obra</h1><p>Esta ação retira a obra do ArchiveNova e não pode ser desfeita pela interface.</p></div></div>
              <div className="danger-zone-card"><span>⚠</span><div><h2>Excluir “{work.title}”</h2><p>A obra deixa de aparecer para leitores imediatamente. Digite o título exato abaixo para liberar o botão.</p><label>Digite <strong>{work.title}</strong><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><button className="danger-button large" disabled={busy || deleteConfirmation !== work.title} onClick={removeWork}>{busy ? 'Excluindo…' : 'Excluir obra'}</button></div></div>
            </div>
          ) : null}

          {error ? <div className="manage-alert error" role="alert">{error}</div> : null}
          {message ? <div className="manage-alert success" role="status">{message}</div> : null}
        </section>
      </div>
    </main>
  )
}
