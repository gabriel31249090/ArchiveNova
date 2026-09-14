'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'
import { useNovaConfirm } from '@/components/ui/nova-confirm'
import type { ModerationReport } from '@/lib/types'

function reasonLabel(reason: string) {
  return ({ HARASSMENT: 'Assédio', HATE: 'Discurso de ódio', SPAM: 'Spam', PLAGIARISM: 'Plágio', ILLEGAL: 'Conteúdo ilegal', OTHER: 'Outro' } as Record<string, string>)[reason] || reason
}

export function ModerationCenter() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const { ask: confirmAction, dialog: confirmDialog } = useNovaConfirm()
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('USER')
  const [reports, setReports] = useState<ModerationReport[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!supabase) { setLoading(false); return }
    const current = (await supabase.auth.getUser()).data.user || null
    setUser(current)
    if (!current) { setLoading(false); return }
    const profileResponse = await supabase.from('profiles').select('role').eq('id', current.id).maybeSingle()
    const nextRole = String(profileResponse.data?.role || 'USER')
    setRole(nextRole)
    if (!['MODERATOR', 'ADMIN'].includes(nextRole)) { setLoading(false); return }
    const { data, error: queueError } = await supabase.rpc('moderation_queue', { limit_count: 100 })
    if (queueError) {
      console.error(queueError)
      setError('Não foi possível abrir a fila. Execute a migration das Fases 6–8.')
      setLoading(false)
      return
    }
    const payload = (data || {}) as { items?: ModerationReport[] }
    setReports(payload.items || [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [supabase])

  function notify(value: string) {
    setMessage(value)
    window.setTimeout(() => setMessage((current) => current === value ? '' : current), 2600)
  }

  async function setStatus(report: ModerationReport, status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED') {
    if (!supabase) return
    setBusyId(report.id)
    const { error: actionError } = await supabase.rpc('resolve_report', { target_report: report.id, next_status: status })
    setBusyId('')
    if (actionError) return notify('Não foi possível atualizar a denúncia.')
    if (status === 'REVIEWING') setReports((current) => current.map((item) => item.id === report.id ? { ...item, status } : item))
    else setReports((current) => current.filter((item) => item.id !== report.id))
    notify(status === 'DISMISSED' ? 'Denúncia descartada.' : status === 'RESOLVED' ? 'Denúncia resolvida.' : 'Denúncia marcada para revisão.')
  }

  async function hideComment(report: ModerationReport) {
    if (!supabase || !report.comment_id) return
    if (!(await confirmAction({
      title: 'Ocultar comentário?',
      description: 'O comentário deixará de aparecer na área pública. A denúncia continuará disponível para revisão.',
      confirmLabel: 'Ocultar comentário',
      tone: 'danger',
    }))) return
    setBusyId(report.id)
    const { error: actionError } = await supabase.rpc('moderate_comment', { target_comment: report.comment_id, hide: true })
    setBusyId('')
    if (actionError) return notify('Não foi possível ocultar o comentário.')
    notify('Comentário ocultado. Agora você pode resolver a denúncia.')
  }

  async function hideWork(report: ModerationReport) {
    if (!supabase || !report.work_id) return
    if (!(await confirmAction({
      title: 'Ocultar obra do público?',
      description: 'O autor ainda poderá vê-la e a equipe poderá restaurá-la depois.',
      confirmLabel: 'Ocultar obra',
      tone: 'danger',
    }))) return
    setBusyId(report.id)
    const { error: actionError } = await supabase.rpc('moderate_work', { target_work: report.work_id, hide: true })
    setBusyId('')
    if (actionError) return notify('Não foi possível ocultar a obra.')
    notify('Obra retirada do público.')
  }

  if (loading) return <><NovaHeader title="Moderação" /><main className="moderation-page"><div className="studio-loading"><span /><h1>Abrindo fila de moderação…</h1></div></main></>
  if (!user) return <><NovaHeader title="Moderação" /><main className="moderation-page"><div className="studio-gate"><span><NovaIcon name="flag" size={30} /></span><h1>Área restrita.</h1><p>Entre com uma conta de moderador ou administrador.</p><Link className="primary-button" href="/explore?auth=login&return=/moderation">Entrar</Link></div></main></>
  if (!['MODERATOR', 'ADMIN'].includes(role)) return <><NovaHeader title="Moderação" /><main className="moderation-page"><div className="profile-not-found"><span><NovaIcon name="flag" size={30} /></span><h1>Você não tem acesso à moderação.</h1><p>Esta área é reservada à equipe do Archive Nova.</p><Link className="primary-button" href="/explore">Voltar ao arquivo</Link></div></main></>

  return (
    <>
      <NovaHeader title="Moderação" />
      <main className="moderation-page">
        <section className="moderation-head"><div><p className="eyebrow">Trust & Safety</p><h1>Fila de moderação</h1><p>Analise denúncias, oculte conteúdo quando necessário e registre a decisão.</p></div><div className="moderation-role"><span>Conta</span><strong>{role === 'ADMIN' ? 'Administrador' : 'Moderador'}</strong></div></section>
        {error ? <div className="studio-alert error">{error}</div> : null}
        {message ? <div className="studio-alert success">{message}</div> : null}
        <section className="moderation-stats"><div><strong>{reports.length}</strong><span>pendentes</span></div><div><strong>{reports.filter((report) => report.status === 'OPEN').length}</strong><span>novas</span></div><div><strong>{reports.filter((report) => report.status === 'REVIEWING').length}</strong><span>em revisão</span></div></section>
        {reports.length ? <div className="moderation-list">{reports.map((report) => <article className="moderation-card" key={report.id}><header><div className="moderation-reason"><span>{reasonLabel(report.reason)}</span><b className={report.status.toLowerCase()}>{report.status === 'REVIEWING' ? 'Em revisão' : 'Nova'}</b></div><small>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.created_at))}</small></header><div className="moderation-target"><span>{report.work_id ? 'OBRA' : 'COMENTÁRIO'}</span>{report.work_id ? <><Link href={`/works/${report.work_id}`}><h2>{report.work_title || 'Obra denunciada'}</h2></Link></> : <><h2>Comentário de @{report.comment_author_username || 'usuário'}</h2><blockquote>{report.comment_body || 'Comentário indisponível.'}</blockquote></>}</div>{report.details ? <div className="moderation-details"><strong>Relato de @{report.reporter_username || 'usuário'}</strong><p>{report.details}</p></div> : <div className="moderation-details"><strong>Relato</strong><p>O usuário não acrescentou detalhes.</p></div>}<footer>{report.work_id ? <button className="danger-button" disabled={busyId === report.id} onClick={() => void hideWork(report)}>Ocultar obra</button> : <button className="danger-button" disabled={busyId === report.id} onClick={() => void hideComment(report)}>Ocultar comentário</button>}<div><button className="ghost-button" disabled={busyId === report.id} onClick={() => void setStatus(report, 'DISMISSED')}>Descartar</button>{report.status === 'OPEN' ? <button className="secondary-button" disabled={busyId === report.id} onClick={() => void setStatus(report, 'REVIEWING')}>Assumir revisão</button> : null}<button className="primary-button" disabled={busyId === report.id} onClick={() => void setStatus(report, 'RESOLVED')}>Resolver</button></div></footer></article>)}</div> : <div className="studio-empty moderation-empty"><span><NovaIcon name="check" size={30} /></span><h2>Fila limpa</h2><p>Não há denúncias abertas ou em revisão.</p></div>}
        {confirmDialog}
      </main>
    </>
  )
}
