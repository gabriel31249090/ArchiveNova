'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { RichTextField } from '@/components/editor/rich-text-field'
import { sanitizeStoryHtml } from '@/lib/writer-draft'
import type { CollaborationHubPayload, WorkContribution } from '@/lib/types'

function statusLabel(status: WorkContribution['status']) {
  return ({ OPEN: 'Aberta', CHANGES_REQUESTED: 'Alterações solicitadas', ACCEPTED: 'Aceita', REJECTED: 'Rejeitada', WITHDRAWN: 'Retirada' } as const)[status]
}

function verdictLabel(value: string) {
  if (value === 'APPROVE') return 'Aprovou'
  if (value === 'REQUEST_CHANGES') return 'Solicitou alterações'
  return 'Comentou'
}

export function CollaborationHub({ workId }: { workId: string }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [hub, setHub] = useState<CollaborationHubPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [kind, setKind] = useState<'NEW_CHAPTER' | 'CHAPTER_EDIT'>('NEW_CHAPTER')
  const [chapterId, setChapterId] = useState('')
  const [title, setTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [content, setContent] = useState('<p></p>')
  const [note, setNote] = useState('')
  const [openContribution, setOpenContribution] = useState<string | null>(null)

  async function load() {
    if (!supabase) { setLoading(false); return }
    const current = (await supabase.auth.getUser()).data.user || null
    setUser(current)
    const { data, error } = await supabase.rpc('get_collaboration_hub', { target_work: workId })
    if (error) {
      console.error(error)
      setMessage(error.message?.includes('AUTH_REQUIRED') ? 'Entre para ver ou enviar contribuições.' : 'Não foi possível abrir a área de colaboração.')
      setHub(null)
    } else setHub(data as CollaborationHubPayload)
    setLoading(false)
  }

  useEffect(() => { void load() }, [supabase, workId])

  function login() { window.location.href = `/explore?auth=login&return=${encodeURIComponent(`/works/${workId}/contribute`)}` }

  async function toggleOpen() {
    if (!supabase || !hub?.permissions.is_owner) return
    setBusy(true)
    const next = !hub.work.allow_contributions
    const { error } = await supabase.rpc('set_work_contributions_open', { target_work: workId, is_open: next })
    setBusy(false)
    if (error) setMessage('Não foi possível alterar as contribuições.')
    else { setMessage(next ? 'Contribuições abertas para a comunidade.' : 'Contribuições fechadas.'); await load() }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !hub?.permissions.is_owner) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    const { error } = await supabase.rpc('invite_work_collaborator', { target_work: workId, collaborator_username: String(data.get('username') || '').replace(/^@/, ''), collaborator_role: String(data.get('role') || 'REVIEWER') })
    setBusy(false)
    if (error) { console.error(error); setMessage(error.message?.includes('PROFILE_NOT_FOUND') ? 'Usuário não encontrado.' : 'Não foi possível enviar o convite.'); return }
    form.reset(); setMessage('Convite enviado.'); await load()
  }

  async function respondInvitation(accept: boolean) {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.rpc('respond_work_invitation', { target_work: workId, accept_invite: accept })
    setBusy(false)
    if (error) setMessage('Não foi possível responder ao convite.')
    else { setMessage(accept ? 'Convite aceito.' : 'Convite recusado.'); await load() }
  }

  async function submitContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) { login(); return }
    if (!hub?.permissions.can_submit) { setMessage('O autor não está aceitando contribuições no momento.'); return }
    if (!title.trim() || !content.replace(/<[^>]+>/g, '').trim()) { setMessage('Dê um título à proposta e escreva o conteúdo.'); return }
    if (kind === 'CHAPTER_EDIT' && !chapterId) { setMessage('Escolha o capítulo que deseja editar.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('submit_work_contribution', {
      target_work: workId,
      contribution_kind: kind,
      contribution_title: title.trim(),
      proposed_content_input: content,
      proposed_chapter_title_input: chapterTitle.trim() || null,
      target_chapter: kind === 'CHAPTER_EDIT' ? chapterId : null,
      contribution_note: note.trim() || null,
    })
    setBusy(false)
    if (error) { console.error(error); setMessage('Não foi possível enviar a contribuição.'); return }
    setTitle(''); setChapterTitle(''); setChapterId(''); setContent('<p></p>'); setNote(''); setMessage('Contribuição enviada para revisão.'); await load()
  }

  async function review(event: FormEvent<HTMLFormElement>, contributionId: string) {
    event.preventDefault()
    if (!supabase || !hub?.permissions.can_review) return
    const form = event.currentTarget
    const data = new FormData(form)
    const body = String(data.get('body') || '').trim()
    const verdict = String(data.get('verdict') || 'COMMENT')
    if (!body) return
    setBusy(true)
    const { error } = await supabase.rpc('review_work_contribution', { target_contribution: contributionId, review_verdict: verdict, review_body: body })
    setBusy(false)
    if (error) setMessage('Não foi possível enviar a revisão.')
    else { form.reset(); setMessage('Revisão publicada.'); await load() }
  }

  async function merge(contributionId: string) {
    if (!supabase || !hub?.permissions.can_merge) return
    if (!window.confirm('Aceitar esta contribuição e aplicar o conteúdo à obra?')) return
    setBusy(true)
    const { error } = await supabase.rpc('merge_work_contribution', { target_contribution: contributionId })
    setBusy(false)
    if (error) { console.error(error); setMessage('Não foi possível aceitar a contribuição.'); return }
    setMessage('Contribuição aceita e aplicada à obra.'); await load()
  }

  if (loading) return <><NovaHeader title="Contribuições" /><main className="collaboration-page"><div className="community-loading"><span /><p>Carregando colaboração…</p></div></main></>
  if (!hub) return <><NovaHeader title="Contribuições" /><main className="collaboration-page"><div className="profile-not-found"><span>⑂</span><h1>{message || 'Colaboração indisponível.'}</h1>{user ? <Link className="primary-button" href={`/works/${workId}`}>Voltar à obra</Link> : <button className="primary-button" onClick={login}>Entrar</button>}</div></main></>

  const pendingInvite = hub.collaborators.find((item) => item.user_id === user?.id && item.status === 'PENDING')
  const visibleContributions = hub.contributions

  return (
    <>
      <NovaHeader title="Contribuições" />
      <main className="collaboration-page">
        <section className="collab-hero"><div><p className="eyebrow">Colaboração aberta</p><h1>{hub.work.title}</h1><p>Envie propostas como um pull request: o conteúdo fica separado da obra até o autor revisar e aceitar.</p><div className="collab-badges"><span className={hub.work.allow_contributions ? 'open' : ''}>{hub.work.allow_contributions ? '● Aceitando contribuições' : '○ Contribuições fechadas'}</span><span>{visibleContributions.filter((item) => item.status === 'OPEN' || item.status === 'CHANGES_REQUESTED').length} abertas</span></div></div><div className="collab-hero-actions"><Link className="secondary-button" href={`/works/${workId}`}>← Voltar à obra</Link>{hub.permissions.is_owner ? <button className="primary-button" disabled={busy} onClick={() => void toggleOpen()}>{hub.work.allow_contributions ? 'Fechar contribuições' : 'Abrir contribuições'}</button> : null}</div></section>

        {pendingInvite ? <section className="collab-invite-banner"><span>✦</span><div><strong>Você recebeu um convite para colaborar</strong><p>Papel: {pendingInvite.role === 'EDITOR' ? 'Editor' : 'Revisor'}.</p></div><button onClick={() => void respondInvitation(false)} disabled={busy}>Recusar</button><button className="primary-button" onClick={() => void respondInvitation(true)} disabled={busy}>Aceitar</button></section> : null}
        {message ? <div className="community-message" role="status">{message}</div> : null}

        <div className="collab-layout">
          <section className="collab-main">
            <header className="collab-section-head"><div><p className="eyebrow">Contribuições</p><h2>Propostas da obra</h2></div><span>{visibleContributions.length}</span></header>
            {visibleContributions.length ? <div className="contribution-list">{visibleContributions.map((contribution) => <article className={`contribution-card status-${contribution.status.toLowerCase()}`} key={contribution.id}><button className="contribution-summary" onClick={() => setOpenContribution((current) => current === contribution.id ? null : contribution.id)}><span className="contribution-icon">⑂</span><div><strong>{contribution.title}</strong><p>#{contribution.id.slice(0,8)} por <b>@{contribution.username}</b> · {contribution.type === 'NEW_CHAPTER' ? 'novo capítulo' : 'edição de capítulo'}</p></div><span className="contribution-status">{statusLabel(contribution.status)}</span><b>{openContribution === contribution.id ? '−' : '＋'}</b></button>{openContribution === contribution.id ? <div className="contribution-detail"><div className="contribution-meta"><span><small>Capítulo proposto</small><strong>{contribution.proposed_chapter_title || 'Sem título'}</strong></span><span><small>Atualizado</small><strong>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(contribution.updated_at))}</strong></span></div>{contribution.note ? <blockquote>{contribution.note}</blockquote> : null}<div className="contribution-preview" dangerouslySetInnerHTML={{ __html: sanitizeStoryHtml(contribution.proposed_content) }} /><section className="review-thread"><h3>Revisões</h3>{contribution.reviews.map((review) => <article key={review.id}><div><strong>{review.display_name}</strong><span>{verdictLabel(review.verdict)}</span></div><p>{review.body}</p></article>)}{hub.permissions.can_review && ['OPEN','CHANGES_REQUESTED'].includes(contribution.status) ? <form onSubmit={(event) => void review(event, contribution.id)}><textarea name="body" rows={3} maxLength={12000} placeholder="Escreva uma revisão…" required /><div><select name="verdict" defaultValue="COMMENT"><option value="COMMENT">Comentar</option><option value="APPROVE">Aprovar</option><option value="REQUEST_CHANGES">Solicitar alterações</option></select><button className="secondary-button" disabled={busy}>Enviar revisão</button>{hub.permissions.can_merge ? <button type="button" className="primary-button" disabled={busy} onClick={() => void merge(contribution.id)}>✓ Aceitar e mesclar</button> : null}</div></form> : null}</section></div> : null}</article>)}</div> : <div className="studio-empty"><span>⑂</span><p>Nenhuma contribuição enviada ainda.</p></div>}
          </section>

          <aside className="collab-sidebar">
            {hub.permissions.can_submit ? <form className="contribution-form" onSubmit={submitContribution}><p className="eyebrow">Nova contribuição</p><h2>Propor alteração</h2><label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value as 'NEW_CHAPTER' | 'CHAPTER_EDIT')}><option value="NEW_CHAPTER">Novo capítulo</option><option value="CHAPTER_EDIT">Editar capítulo existente</option></select></label>{kind === 'CHAPTER_EDIT' ? <label>Capítulo<select value={chapterId} onChange={(event) => setChapterId(event.target.value)} required><option value="">Selecione…</option>{hub.chapters.map((chapter) => <option value={chapter.id} key={chapter.id}>{chapter.number}. {chapter.title || 'Sem título'}</option>)}</select></label> : null}<label>Título da contribuição<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={220} placeholder="Ex.: Corrige continuidade do capítulo 3" required /></label><label>Título do capítulo<input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} maxLength={300} placeholder="Opcional" /></label><label>Conteúdo proposto<RichTextField value={content} onChange={setContent} minHeight={260} placeholder="Escreva a proposta…" /></label><label>Nota para o autor<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={3000} placeholder="Explique o que você mudou e por quê." /></label><button className="primary-button" disabled={busy}>Enviar contribuição</button></form> : <div className="collab-closed"><span>⑂</span><h3>Contribuições fechadas</h3><p>O autor pode reabrir essa opção no futuro.</p></div>}

            {hub.permissions.is_owner ? <form className="collaborator-invite-form" onSubmit={invite}><p className="eyebrow">Equipe da obra</p><h2>Convidar colaborador</h2><label>Usuário<input name="username" placeholder="@username" required /></label><label>Papel<select name="role" defaultValue="REVIEWER"><option value="REVIEWER">Revisor</option><option value="EDITOR">Editor</option></select></label><button className="secondary-button" disabled={busy}>Enviar convite</button><div className="collaborator-list">{hub.collaborators.map((person) => <div key={person.user_id}><span>{person.display_name.slice(0,1).toUpperCase()}</span><div><strong>{person.display_name}</strong><small>@{person.username} · {person.role} · {person.status}</small></div></div>)}</div></form> : null}
          </aside>
        </div>
      </main>
    </>
  )
}
