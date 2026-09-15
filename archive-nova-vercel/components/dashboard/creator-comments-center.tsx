'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'

type CommentRow = {
  id: string
  chapter_id: string
  parent_id: string | null
  body: string
  created_at: string
  work_id: string
  work_title: string
  chapter_number: number
  chapter_title: string
  user_id: string
  username: string
  display_name: string
}

export function CreatorCommentsCenter() {
  const supabase = useMemo(() => createClient(), [])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [replying, setReplying] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('creator_comment_center', { limit_count: 300 })
    if (!error && Array.isArray(data)) setComments(data as unknown as CommentRow[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  async function sendReply(target: CommentRow) {
    if (!reply.trim()) return
    const { error } = await supabase.rpc('creator_reply_comment', { target_comment: target.id, reply_body: reply.trim() })
    if (error) { setNotice('Não foi possível responder este comentário.'); return }
    setReply(''); setReplying(null); setNotice('Resposta publicada.'); void load()
  }

  const filtered = comments.filter((comment) => {
    const haystack = `${comment.work_title} ${comment.chapter_title} ${comment.display_name} ${comment.username} ${comment.body}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  return <><NovaHeader title="Comentários"/><main className="creator-comments-v49">
    <header className="creator-comments-hero"><div><p className="eyebrow">Writer Experience</p><h1>Todos os comentários, num só lugar.</h1><p>Leia, filtre e responda sem abrir obra por obra.</p></div><div><Link className="secondary-button" href="/write">Writer Home</Link><Link className="secondary-button" href="/dashboard">Studio</Link></div></header>
    <div className="creator-comments-search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar obra, capítulo, leitor ou texto…"/><span>{filtered.length} comentário(s)</span></div>
    {loading ? <div className="studio-loading"><span/><h2>Buscando conversas…</h2></div> : <section className="creator-comments-list">{filtered.map((comment) => <article key={comment.id}><header><div className="avatar">{comment.username.slice(0,1).toUpperCase()}</div><div><strong>{comment.display_name}</strong><span>@{comment.username} · {new Date(comment.created_at).toLocaleString('pt-BR')}</span></div><Link href={`/works/${comment.work_id}`}>{comment.work_title}</Link></header><div className="creator-comment-context">Cap. {comment.chapter_number} · {comment.chapter_title || 'Sem título'}</div><p>{comment.body}</p>{replying === comment.id ? <div className="creator-comment-reply"><textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Responder como autor…"/><div><button type="button" onClick={() => { setReplying(null); setReply('') }}>Cancelar</button><button className="primary-button" type="button" onClick={() => void sendReply(comment)}>Responder</button></div></div> : <button className="ghost-button" type="button" onClick={() => { setReplying(comment.id); setReply('') }}>Responder</button>}</article>)}{!filtered.length ? <div className="writer-home-empty"><span>☵</span><h2>Nenhum comentário encontrado.</h2><p>Quando leitores comentarem suas obras, a conversa aparecerá aqui.</p></div> : null}</section>}
    {notice ? <div className="writer-xp-notice" role="status">{notice}</div> : null}
  </main></>
}
