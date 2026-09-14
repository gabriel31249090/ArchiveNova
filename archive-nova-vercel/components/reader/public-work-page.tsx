'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { sanitizeStoryHtml } from '@/lib/writer-draft'
import type { Chapter, CommentItem, WorkCardData, WorkDetail } from '@/lib/types'

function normalizeWork(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''), creator_id: String(row.creator_id || ''), title: String(row.title || ''), summary: String(row.summary || ''), rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'], status: String(row.status || 'ONGOING') as WorkCardData['status'], visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'], language: String(row.language || 'pt-BR'), expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters), word_count: Number(row.word_count || 0), chapter_count: Number(row.chapter_count || 0), kudos_count: Number(row.kudos_count || 0), bookmarks_count: Number(row.bookmarks_count || 0), comments_count: Number(row.comments_count || 0), hits_count: Number(row.hits_count || 0), allow_comments: Boolean(row.allow_comments), published_at: row.published_at ? String(row.published_at) : null, updated_at: String(row.updated_at || ''), created_at: String(row.created_at || ''), author_username: String(row.author_username || ''), author_display_name: String(row.author_display_name || row.author_username || ''), fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [], tags: Array.isArray(row.tags) ? row.tags.map(String) : [], kudosed: Boolean(row.kudosed), bookmarked: Boolean(row.bookmarked), subscribed: Boolean(row.subscribed), allow_contributions: Boolean(row.allow_contributions),
  }
}

function normalizeChapter(row: Record<string, unknown>): Chapter {
  return { id: String(row.id || ''), work_id: String(row.work_id || ''), chapter_number: Number(row.chapter_number || 0), title: row.title == null ? null : String(row.title), content: String(row.content || ''), notes_before: row.notes_before == null ? null : String(row.notes_before), notes_after: row.notes_after == null ? null : String(row.notes_after), word_count: Number(row.word_count || 0), status: String(row.status || 'PUBLISHED') as Chapter['status'], published_at: row.published_at == null ? null : String(row.published_at), created_at: String(row.created_at || ''), updated_at: String(row.updated_at || '') }
}

function ratingLabel(rating: WorkCardData['rating']) { return ({ GENERAL: 'Livre', TEEN: 'Teen', MATURE: 'Mature', EXPLICIT: 'Explicit', NOT_RATED: 'Não classificada' } as const)[rating] }
function fmt(value: number) { return new Intl.NumberFormat('pt-BR', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value || 0) }

export function PublicWorkPage({ workId }: { workId: string }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [detail, setDetail] = useState<WorkDetail | null>(null)
  const [chapterId, setChapterId] = useState('')
  const [comments, setComments] = useState<CommentItem[]>([])
  const [fontSize, setFontSize] = useState(19)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [reportTarget, setReportTarget] = useState<{ type: 'work' | 'comment'; id: string; label: string } | null>(null)
  const [reportReason, setReportReason] = useState('HARASSMENT')
  const [reportDetails, setReportDetails] = useState('')
  const [supportEnabled, setSupportEnabled] = useState(false)

  const currentChapter = detail?.chapters.find((chapter) => chapter.id === chapterId) || detail?.chapters[0] || null
  const isOwner = Boolean(user && detail?.work.creator_id === user.id)

  const loadWork = useCallback(async () => {
    if (!supabase) { setLoading(false); setError('Supabase não configurado.'); return }
    const currentUser = (await supabase.auth.getUser()).data.user || null
    setUser(currentUser)
    const { data, error: detailError } = await supabase.rpc('get_work_detail', { target_work: workId })
    if (detailError || !data) {
      console.error(detailError)
      setError('Esta obra não existe ou não está disponível para você.')
      setLoading(false)
      return
    }
    const raw = data as { work: Record<string, unknown>; chapters: Record<string, unknown>[] }
    const next: WorkDetail = { work: normalizeWork(raw.work), chapters: (raw.chapters || []).map(normalizeChapter) }
    setDetail(next)
    const supportResponse = await supabase.from('creator_support_profiles').select('enabled').eq('user_id', next.work.creator_id).eq('enabled', true).maybeSingle()
    setSupportEnabled(Boolean(supportResponse.data?.enabled))
    setChapterId((current) => current && next.chapters.some((chapter) => chapter.id === current) ? current : next.chapters[0]?.id || '')
    setLoading(false)
  }, [supabase, workId])

  const loadComments = useCallback(async () => {
    if (!supabase || !currentChapter) { setComments([]); return }
    const { data, error: commentsError } = await supabase.from('comments').select('id,chapter_id,user_id,parent_id,body,status,created_at,updated_at,profile:profiles!comments_user_id_fkey(username,display_name)').eq('chapter_id', currentChapter.id).eq('status', 'VISIBLE').order('created_at', { ascending: true })
    if (commentsError) { console.error(commentsError); return }
    setComments(((data || []) as unknown as CommentItem[]).map((item) => ({ ...item, profile: Array.isArray(item.profile) ? item.profile[0] : item.profile })))
  }, [supabase, currentChapter])

  useEffect(() => { void loadWork() }, [loadWork])
  useEffect(() => { if (currentChapter) void loadComments() }, [currentChapter, loadComments])
  useEffect(() => {
    if (!detail || !currentChapter) return
    void fetch(`/api/works/${detail.work.id}/hit`, { method: 'POST' })
    if (user && supabase) void supabase.rpc('record_history', { target_work: detail.work.id, target_chapter: currentChapter.id })
  }, [detail?.work.id])

  function notify(value: string) {
    setMessage(value)
    window.setTimeout(() => setMessage((current) => current === value ? '' : current), 2800)
  }

  function requireLogin() {
    if (user) return true
    window.location.href = `/explore?auth=login&return=${encodeURIComponent(`/works/${workId}`)}`
    return false
  }

  async function toggleKudos() {
    if (!detail || !supabase || !requireLogin()) return
    setBusy(true)
    const before = detail.work.kudosed
    const { error: actionError } = await supabase.rpc('toggle_kudos', { target_work: detail.work.id })
    setBusy(false)
    if (actionError) return notify('Não foi possível alterar o kudos.')
    setDetail((current) => current ? { ...current, work: { ...current.work, kudosed: !before, kudos_count: Math.max(0, current.work.kudos_count + (before ? -1 : 1)) } } : current)
    notify(before ? 'Kudos removido.' : 'Kudos enviado ♥')
  }

  async function toggleBookmark() {
    if (!detail || !supabase || !requireLogin()) return
    setBusy(true)
    const before = detail.work.bookmarked
    const { error: actionError } = await supabase.rpc('toggle_bookmark', { target_work: detail.work.id })
    setBusy(false)
    if (actionError) return notify('Não foi possível alterar o bookmark.')
    setDetail((current) => current ? { ...current, work: { ...current.work, bookmarked: !before, bookmarks_count: Math.max(0, current.work.bookmarks_count + (before ? -1 : 1)) } } : current)
    notify(before ? 'Bookmark removido.' : 'Obra salva na biblioteca.')
  }

  async function toggleSubscription() {
    if (!detail || !supabase || !requireLogin()) return
    setBusy(true)
    const { data, error: actionError } = await supabase.rpc('toggle_work_subscription', { target_work: detail.work.id })
    setBusy(false)
    if (actionError) return notify('Não foi possível alterar a inscrição.')
    setDetail((current) => current ? { ...current, work: { ...current.work, subscribed: Boolean(data) } } : current)
    notify(data ? 'Você receberá avisos de novos capítulos.' : 'Inscrição removida.')
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !detail || !currentChapter || !requireLogin() || !user) return
    const form = event.currentTarget
    const data = new FormData(form)
    const body = String(data.get('comment') || '').trim()
    if (!body) return
    setBusy(true)
    const { error: commentError } = await supabase.from('comments').insert({ chapter_id: currentChapter.id, user_id: user.id, body, parent_id: replyTo?.id || null })
    setBusy(false)
    if (commentError) return notify('Não foi possível publicar o comentário.')
    form.reset()
    setReplyTo(null)
    await loadComments()
    setDetail((current) => current ? { ...current, work: { ...current.work, comments_count: current.work.comments_count + 1 } } : current)
    notify(replyTo ? 'Resposta publicada.' : 'Comentário publicado.')
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reportTarget || !supabase || !requireLogin()) return
    setBusy(true)
    const { error: reportError } = await supabase.rpc('submit_report', {
      target_work: reportTarget.type === 'work' ? reportTarget.id : null,
      target_comment: reportTarget.type === 'comment' ? reportTarget.id : null,
      report_reason: reportReason,
      report_details: reportDetails.trim() || null,
    })
    setBusy(false)
    if (reportError) return notify('Não foi possível enviar a denúncia.')
    setReportTarget(null)
    setReportDetails('')
    notify('Denúncia enviada para a moderação.')
  }

  if (loading) return <><NovaHeader /><main className="public-reader-page"><div className="studio-loading"><span /><h1>Abrindo história…</h1></div></main></>
  if (error || !detail) return <><NovaHeader /><main className="public-reader-page"><div className="profile-not-found"><span>☾</span><h1>{error || 'Obra não encontrada.'}</h1><Link className="primary-button" href="/explore">Explorar outras histórias</Link></div></main></>

  const work = detail.work
  const topLevel = comments.filter((comment) => !comment.parent_id)
  const repliesFor = (id: string) => comments.filter((comment) => comment.parent_id === id)

  return (
    <>
      <NovaHeader />
      <main className="public-reader-page" style={{ '--reader-size': `${fontSize}px` } as CSSProperties}>
        <section className="public-work-hero">
          <div className="public-work-kicker"><span className="rating-badge">{work.rating === 'GENERAL' ? 'G' : work.rating === 'TEEN' ? 'T' : work.rating === 'MATURE' ? 'M' : work.rating === 'EXPLICIT' ? 'E' : '?'}</span><span>{ratingLabel(work.rating)}</span><i>•</i><span>{work.status === 'COMPLETE' ? 'Concluída' : work.status === 'HIATUS' ? 'Em hiato' : 'Em andamento'}</span></div>
          <h1>{work.title}</h1>
          <p className="public-work-author">por <Link href={`/users/${encodeURIComponent(work.author_username)}`}>{work.author_display_name}</Link></p>
          <p className="public-work-summary">{work.summary || 'Sem resumo.'}</p>
          <div className="public-work-taxonomy"><div>{work.fandoms.map((item) => <span className="primary" key={item}>{item}</span>)}</div><div>{work.tags.map((item) => <span key={item}>{item}</span>)}</div></div>
          <div className="public-work-stats"><span><strong>{fmt(work.word_count)}</strong> palavras</span><span><strong>{work.chapter_count}{work.expected_chapters ? `/${work.expected_chapters}` : ''}</strong> capítulos</span><span><strong>{fmt(work.hits_count)}</strong> leituras</span><span><strong>{fmt(work.kudos_count)}</strong> kudos</span><span><strong>{fmt(work.comments_count)}</strong> comentários</span></div>
          <div className="public-work-actions">
            <button className={`reader-social-button ${work.kudosed ? 'active' : ''}`} disabled={busy} onClick={toggleKudos}>{work.kudosed ? '♥ Kudos' : '♡ Dar kudos'}</button>
            <button className={`reader-social-button ${work.bookmarked ? 'active' : ''}`} disabled={busy} onClick={toggleBookmark}>{work.bookmarked ? '★ Salva' : '☆ Bookmark'}</button>
            {!isOwner ? <button className={`reader-social-button ${work.subscribed ? 'active' : ''}`} disabled={busy} onClick={toggleSubscription}>{work.subscribed ? '✓ Acompanhando' : '＋ Acompanhar'}</button> : <Link className="reader-social-button active" href={`/works/${work.id}/manage`}>⚙ Gerenciar</Link>}
            {isOwner ? <Link className="reader-social-button" href={`/works/${work.id}/contribute`}>⑂ Contribuições</Link> : work.allow_contributions ? <Link className="reader-social-button" href={`/works/${work.id}/contribute`}>⑂ Contribuir</Link> : null}
            {!isOwner && supportEnabled ? <Link className="reader-social-button support" href={`/support/${encodeURIComponent(work.author_username)}`}>♡ Apoiar autor</Link> : null}
            {!isOwner ? <button className="reader-social-button subtle" onClick={() => setReportTarget({ type: 'work', id: work.id, label: work.title })}>⋯ Denunciar</button> : null}
          </div>
        </section>

        <div className="public-reader-layout">
          <aside className="public-chapter-sidebar">
            <div className="public-chapter-sidebar-head"><span>CAPÍTULOS</span><b>{detail.chapters.length}</b></div>
            <nav>{detail.chapters.map((chapter) => <button key={chapter.id} className={chapter.id === currentChapter?.id ? 'active' : ''} onClick={() => { setChapterId(chapter.id); if (user && supabase) void supabase.rpc('record_history', { target_work: work.id, target_chapter: chapter.id }); window.scrollTo({ top: 340, behavior: 'smooth' }) }}><strong>{String(chapter.chapter_number).padStart(2, '0')}</strong><span>{chapter.title || `Capítulo ${chapter.chapter_number}`}</span><small>{fmt(chapter.word_count)} palavras</small></button>)}</nav>
          </aside>

          <section className="public-reader-main">
            <div className="public-reader-controls"><div><button onClick={() => setFontSize((value) => Math.max(14, value - 1))}>A−</button><span>{fontSize}px</span><button onClick={() => setFontSize((value) => Math.min(30, value + 1))}>A＋</button></div><span>{currentChapter ? `Capítulo ${currentChapter.chapter_number} de ${detail.chapters.length}` : ''}</span></div>
            {currentChapter ? <article className="public-chapter-paper">
              <header><p className="eyebrow">Capítulo {String(currentChapter.chapter_number).padStart(2, '0')}</p><h2>{currentChapter.title || `Capítulo ${currentChapter.chapter_number}`}</h2>{currentChapter.notes_before ? <div className="chapter-note before"><strong>Nota do autor</strong><p>{currentChapter.notes_before}</p></div> : null}</header>
              <div className="reader-rich-text public-reader-rich" dangerouslySetInnerHTML={{ __html: sanitizeStoryHtml(currentChapter.content) }} />
              {currentChapter.notes_after ? <div className="chapter-note after"><strong>Nota final</strong><p>{currentChapter.notes_after}</p></div> : null}
              <footer className="public-chapter-footer"><button disabled={!detail.chapters.some((chapter) => chapter.chapter_number < currentChapter.chapter_number)} onClick={() => { const index = detail.chapters.findIndex((chapter) => chapter.id === currentChapter.id); const prev = detail.chapters[index - 1]; if (prev) setChapterId(prev.id) }}>← Anterior</button><span>✦</span><button disabled={!detail.chapters.some((chapter) => chapter.chapter_number > currentChapter.chapter_number)} onClick={() => { const index = detail.chapters.findIndex((chapter) => chapter.id === currentChapter.id); const next = detail.chapters[index + 1]; if (next) setChapterId(next.id) }}>Próximo →</button></footer>
            </article> : <div className="studio-empty"><p>Esta obra ainda não possui capítulos disponíveis.</p></div>}

            {currentChapter ? <section className="public-comments">
              <header><div><p className="eyebrow">Conversa</p><h2>Comentários</h2></div><span>{comments.length}</span></header>
              {work.allow_comments ? <form className="public-comment-form" onSubmit={submitComment}>{replyTo ? <div className="reply-context"><span>Respondendo a <strong>@{replyTo.profile?.username}</strong></span><button type="button" onClick={() => setReplyTo(null)}>×</button></div> : null}<textarea name="comment" maxLength={20000} placeholder={user ? 'Deixe um comentário sobre este capítulo…' : 'Entre para comentar…'} disabled={!user || busy} rows={4} /><div><small>Seja gentil com outros leitores e autores.</small>{user ? <button className="primary-button" disabled={busy}>Publicar comentário</button> : <Link className="primary-button" href={`/explore?auth=login&return=${encodeURIComponent(`/works/${work.id}`)}`}>Entrar para comentar</Link>}</div></form> : <div className="comments-closed">Os comentários estão desativados nesta obra.</div>}
              <div className="public-comment-list">{topLevel.map((comment) => <article className="public-comment-thread" key={comment.id}><div className="public-comment-item"><Link className="studio-avatar" href={`/users/${encodeURIComponent(comment.profile?.username || '')}`}>{(comment.profile?.display_name || comment.profile?.username || 'U').slice(0,1).toUpperCase()}</Link><div><p><Link href={`/users/${encodeURIComponent(comment.profile?.username || '')}`}><strong>{comment.profile?.display_name || comment.profile?.username || 'Usuário'}</strong></Link><small>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(comment.created_at))}</small></p><div className="comment-body">{comment.body}</div><footer>{user ? <button onClick={() => setReplyTo(comment)}>Responder</button> : null}{user?.id !== comment.user_id ? <button onClick={() => setReportTarget({ type: 'comment', id: comment.id, label: `comentário de @${comment.profile?.username || 'usuário'}` })}>Denunciar</button> : null}</footer></div></div>{repliesFor(comment.id).map((reply) => <div className="public-comment-item reply" key={reply.id}><Link className="studio-avatar" href={`/users/${encodeURIComponent(reply.profile?.username || '')}`}>{(reply.profile?.display_name || reply.profile?.username || 'U').slice(0,1).toUpperCase()}</Link><div><p><Link href={`/users/${encodeURIComponent(reply.profile?.username || '')}`}><strong>{reply.profile?.display_name || reply.profile?.username || 'Usuário'}</strong></Link><small>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(reply.created_at))}</small></p><div className="comment-body">{reply.body}</div><footer>{user?.id !== reply.user_id ? <button onClick={() => setReportTarget({ type: 'comment', id: reply.id, label: `resposta de @${reply.profile?.username || 'usuário'}` })}>Denunciar</button> : null}</footer></div></div>)}</article>)}</div>
            </section> : null}
          </section>
        </div>
      </main>

      {reportTarget ? <div className="report-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setReportTarget(null) }}><form className="report-dialog" onSubmit={submitReport}><header><div><p className="eyebrow">Segurança da comunidade</p><h2>Denunciar {reportTarget.label}</h2></div><button type="button" onClick={() => setReportTarget(null)}>×</button></header><label>Motivo<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="HARASSMENT">Assédio ou ataque pessoal</option><option value="HATE">Discurso de ódio</option><option value="SPAM">Spam</option><option value="PLAGIARISM">Plágio</option><option value="ILLEGAL">Conteúdo ilegal</option><option value="OTHER">Outro</option></select></label><label>Detalhes<textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} rows={5} maxLength={5000} placeholder="Explique o problema para a equipe de moderação." /></label><footer><button className="ghost-button" type="button" onClick={() => setReportTarget(null)}>Cancelar</button><button className="primary-button" disabled={busy}>Enviar denúncia</button></footer></form></div> : null}
      {message ? <div className="reader-page-toast" role="status">{message}</div> : null}
    </>
  )
}
