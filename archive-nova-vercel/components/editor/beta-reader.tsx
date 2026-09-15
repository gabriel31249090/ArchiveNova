'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type BetaChapter = { id: string; title: string; position: number; content_html: string; word_count: number }
type BetaDraft = { draft_id: string; title: string; invite_id: string; chapters: BetaChapter[] }

export function BetaReader({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [claimNeeded, setClaimNeeded] = useState(false)
  const [draft, setDraft] = useState<BetaDraft | null>(null)
  const [chapterId, setChapterId] = useState('')
  const [feedback, setFeedback] = useState('')
  const [anchor, setAnchor] = useState('')
  const [notice, setNotice] = useState('')

  async function loadPreview() {
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setNeedsAuth(true); setLoading(false); return }
    setNeedsAuth(false)
    const { data, error } = await supabase.rpc('writer_beta_preview', { invite_token: token })
    if (error || !data) { setClaimNeeded(true); setLoading(false); return }
    const next = data as unknown as BetaDraft
    setDraft(next)
    if (!chapterId && next.chapters?.[0]) setChapterId(next.chapters[0].id)
    setClaimNeeded(false); setLoading(false)
  }

  useEffect(() => { void loadPreview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function claim() {
    const { error } = await supabase.rpc('writer_claim_beta_invite', { invite_token: token })
    if (error) { setNotice(error.message.includes('OWNER_CANNOT') ? 'O autor não precisa reivindicar o próprio convite.' : 'Este convite expirou, foi revogado ou já pertence a outro leitor.'); return }
    await loadPreview()
  }

  async function sendFeedback() {
    if (!feedback.trim()) return
    const { error } = await supabase.rpc('writer_beta_leave_feedback', { invite_token: token, target_chapter: chapterId || null, feedback_body: feedback.trim(), feedback_anchor: anchor.trim() || null })
    if (error) { setNotice('Não foi possível enviar o feedback.'); return }
    setFeedback(''); setAnchor(''); setNotice('Feedback enviado ao autor. Obrigado por revisar!')
  }

  if (loading) return <main className="beta-reader-v49 gate"><span>✦</span><h1>Abrindo leitura beta…</h1><p>Validando seu convite privado.</p></main>
  if (needsAuth) return <main className="beta-reader-v49 gate"><span>✦</span><p className="eyebrow">Leitura beta privada</p><h1>Entre para abrir este convite.</h1><p>O link não publica o rascunho. A leitura fica vinculada à sua conta.</p><Link className="primary-button large" href={`/explore?auth=login&return=${encodeURIComponent(`/beta/${token}`)}`}>Entrar no Archive Nova</Link></main>
  if (claimNeeded) return <main className="beta-reader-v49 gate"><span>✦</span><p className="eyebrow">Convite de leitor beta</p><h1>Este autor quer sua opinião.</h1><p>Ao aceitar, o convite ficará vinculado à sua conta e você poderá ler o rascunho enquanto ele estiver ativo.</p><button className="primary-button large" type="button" onClick={() => void claim()}>Aceitar convite</button>{notice ? <p className="form-error">{notice}</p> : null}</main>
  if (!draft) return null

  const chapter = draft.chapters.find((item) => item.id === chapterId) || draft.chapters[0]
  return <main className="beta-reader-v49">
    <header><Link href="/">✦ Archive Nova</Link><div><span>LEITURA BETA · PRIVADA</span><strong>{draft.title || 'Rascunho sem título'}</strong></div><Link href="/home">Sair</Link></header>
    <div className="beta-reader-layout"><aside><p className="eyebrow">Capítulos</p>{draft.chapters.map((item) => <button type="button" className={item.id === chapter?.id ? 'active' : ''} key={item.id} onClick={() => setChapterId(item.id)}><b>{String(item.position).padStart(2,'0')}</b><span>{item.title || `Capítulo ${item.position}`}</span><small>{Number(item.word_count || 0).toLocaleString('pt-BR')} p.</small></button>)}</aside><article className="beta-reader-paper"><div><p className="eyebrow">Capítulo {chapter?.position}</p><h1>{chapter?.title || 'Sem título'}</h1><section dangerouslySetInnerHTML={{ __html: chapter?.content_html || '<p></p>' }} /></div></article><aside className="beta-feedback-panel"><p className="eyebrow">Feedback privado</p><h2>Deixe comentários para o autor.</h2><label>Trecho de referência<input value={anchor} onChange={(e) => setAnchor(e.target.value)} placeholder="Opcional: copie uma frase" /></label><label>Seu comentário<textarea rows={8} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="O que funcionou? Onde ficou confuso? Alguma ideia?" /></label><button className="primary-button" type="button" onClick={() => void sendFeedback()}>Enviar feedback</button>{notice ? <p className="beta-notice">{notice}</p> : null}</aside></div>
  </main>
}
