'use client'

import Link from 'next/link'
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'
import type { CommunityPost } from '@/lib/types'

type FeedMode = 'RECOMMENDED' | 'FOLLOWING' | 'RECENT'
type PostComment = { id: string; user_id: string; body: string; created_at: string; username: string; display_name: string }

function postDate(value: string) {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days} d`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date)
}

function normalizePost(row: Record<string, unknown>): CommunityPost {
  return {
    id: String(row.id || ''), author_id: String(row.author_id || ''), author_username: String(row.author_username || ''),
    author_display_name: String(row.author_display_name || row.author_username || ''), body: String(row.body || ''),
    image_urls: Array.isArray(row.image_urls) ? row.image_urls.map(String) : [], poll_question: row.poll_question ? String(row.poll_question) : null,
    visibility: String(row.visibility || 'PUBLIC') as CommunityPost['visibility'], comments_enabled: Boolean(row.comments_enabled),
    likes_count: Number(row.likes_count || 0), comments_count: Number(row.comments_count || 0), created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''), liked: Boolean(row.liked), viewer_poll_option: row.viewer_poll_option ? String(row.viewer_poll_option) : null,
    poll_options: Array.isArray(row.poll_options) ? row.poll_options.map((item) => {
      const option = item as Record<string, unknown>
      return { id: String(option.id || ''), text: String(option.text || ''), position: Number(option.position || 0), votes: Number(option.votes || 0) }
    }) : [], rank_score: Number(row.rank_score || 0),
  }
}

export function PostsFeed() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<FeedMode>('RECOMMENDED')
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'FOLLOWERS'>('PUBLIC')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [pollOpen, setPollOpen] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, PostComment[]>>({})
  const fileInput = useRef<HTMLInputElement | null>(null)

  async function load(nextMode = mode) {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    setUser(auth.user || null)
    const { data, error } = await supabase.rpc('community_post_feed', { feed_mode: nextMode, limit_count: 30, offset_count: 0 })
    if (error) {
      console.error(error)
      setMessage('Não foi possível carregar os posts. Confirme se a migration v4 foi executada.')
      setPosts([])
    } else {
      setPosts(((data || []) as Record<string, unknown>[]).map(normalizePost))
    }
    setLoading(false)
  }

  useEffect(() => { void load(mode) }, [mode, supabase])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  function requireLogin() {
    if (user) return true
    window.location.href = `/explore?auth=login&return=${encodeURIComponent('/posts')}`
    return false
  }

  function chooseImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/')).slice(0, 4)
    previews.forEach((url) => URL.revokeObjectURL(url))
    setFiles(selected)
    setPreviews(selected.map((file) => URL.createObjectURL(file)))
  }

  async function uploadImages() {
    if (!supabase || !user || files.length === 0) return [] as string[]
    const urls: string[] = []
    for (const file of files) {
      const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-90)
      const path = `${user.id}/${crypto.randomUUID()}-${safe}`
      const { error } = await supabase.storage.from('post-media').upload(path, file, { upsert: false, contentType: file.type })
      if (error) throw error
      urls.push(supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl)
    }
    return urls
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !requireLogin()) return
    const cleanOptions = pollOpen ? pollOptions.map((item) => item.trim()).filter(Boolean) : []
    if (!body.trim() && files.length === 0 && (!pollOpen || !pollQuestion.trim())) { setMessage('Escreva algo, adicione uma imagem ou crie uma enquete.'); return }
    if (pollOpen && (!pollQuestion.trim() || cleanOptions.length < 2)) { setMessage('A enquete precisa de uma pergunta e pelo menos duas opções.'); return }
    setBusy(true); setMessage('')
    try {
      const imageUrls = await uploadImages()
      const { error } = await supabase.rpc('create_community_post', {
        post_body: body.trim(), post_images: imageUrls, post_visibility: visibility,
        poll_question_input: pollOpen ? pollQuestion.trim() : null,
        poll_options_input: cleanOptions,
      })
      if (error) throw error
      previews.forEach((url) => URL.revokeObjectURL(url))
      setBody(''); setFiles([]); setPreviews([]); setPollOpen(false); setPollQuestion(''); setPollOptions(['', ''])
      if (fileInput.current) fileInput.current.value = ''
      setMessage('Post publicado.')
      await load(mode)
    } catch (error) {
      console.error(error)
      setMessage('Não foi possível publicar. Tente novamente.')
    } finally { setBusy(false) }
  }

  async function toggleLike(post: CommunityPost) {
    if (!supabase || !requireLogin()) return
    const { data, error } = await supabase.rpc('toggle_post_like', { target_post: post.id })
    if (error) { setMessage('Não foi possível registrar a curtida.'); return }
    const liked = Boolean(data)
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked, likes_count: Math.max(0, item.likes_count + (liked ? 1 : -1)) } : item))
  }

  async function vote(postId: string, optionId: string) {
    if (!supabase || !requireLogin()) return
    const { error } = await supabase.rpc('vote_post_poll', { target_post: postId, target_option: optionId })
    if (error) { setMessage('Não foi possível votar.'); return }
    await load(mode)
  }

  async function loadComments(postId: string) {
    if (!supabase) return
    setOpenComments((current) => current === postId ? null : postId)
    if (comments[postId]) return
    const { data } = await supabase.from('post_comments').select('id,user_id,body,created_at').eq('post_id', postId).eq('status', 'VISIBLE').order('created_at', { ascending: false }).limit(20)
    const rows = (data || []) as Array<{ id: string; user_id: string; body: string; created_at: string }>
    const ids = [...new Set(rows.map((row) => row.user_id))]
    const profiles = ids.length ? (await supabase.from('profiles').select('id,username,display_name').in('id', ids)).data || [] : []
    const map = new Map((profiles as Array<{ id: string; username: string; display_name: string | null }>).map((profile) => [profile.id, profile]))
    setComments((current) => ({ ...current, [postId]: rows.map((row) => ({ ...row, username: map.get(row.user_id)?.username || 'usuario', display_name: map.get(row.user_id)?.display_name || map.get(row.user_id)?.username || 'Usuário' })) }))
  }

  async function addComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault()
    if (!supabase || !user) { requireLogin(); return }
    const form = event.currentTarget
    const input = new FormData(form).get('comment')?.toString().trim() || ''
    if (!input) return
    const { error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: user.id, body: input })
    if (error) { setMessage('Não foi possível comentar.'); return }
    form.reset()
    setComments((current) => { const next = { ...current }; delete next[postId]; return next })
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, comments_count: post.comments_count + 1 } : post))
    await loadComments(postId)
  }

  const totalVotes = (post: CommunityPost) => post.poll_options.reduce((sum, option) => sum + option.votes, 0)

  return (
    <>
      <NovaHeader title="Posts" />
      <main className="community-page">
        <section className="community-head">
          <div><p className="eyebrow">Comunidade</p><h1>Posts do Archive Nova</h1><p>Atualizações, bastidores, enquetes e conversas entre leitores e escritores.</p></div>
          <Link className="secondary-button" href="/feed">Ver histórias recomendadas</Link>
        </section>

        {user ? <form className="post-composer" onSubmit={publish}>
          <div className="post-composer-avatar">{(user.email || 'U').slice(0, 1).toUpperCase()}</div>
          <div className="post-composer-main">
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={12000} rows={4} placeholder="Compartilhe uma atualização com a comunidade…" />
            {previews.length ? <div className={`post-preview-grid count-${previews.length}`}>{previews.map((url) => <img key={url} src={url} alt="Prévia da imagem do post" />)}</div> : null}
            {pollOpen ? <div className="post-poll-editor"><input value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} maxLength={300} placeholder="Pergunta da enquete" />{pollOptions.map((option, index) => <div key={index}><input value={option} onChange={(event) => setPollOptions((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} maxLength={180} placeholder={`Opção ${index + 1}`} />{pollOptions.length > 2 ? <button type="button" aria-label={`Remover opção ${index + 1}`} onClick={() => setPollOptions((items) => items.filter((_, itemIndex) => itemIndex !== index))}><NovaIcon name="close" size={15} /></button> : null}</div>)}{pollOptions.length < 8 ? <button type="button" className="text-button" onClick={() => setPollOptions((items) => [...items, ''])}><NovaIcon name="plus" size={15} /> Adicionar opção</button> : null}</div> : null}
            <div className="post-composer-footer">
              <div><input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={chooseImages} /><button type="button" onClick={() => fileInput.current?.click()}><NovaIcon name="image" size={16} /> Imagem</button><button type="button" className={pollOpen ? 'active' : ''} onClick={() => setPollOpen((value) => !value)}><NovaIcon name="poll" size={16} /> Enquete</button><select value={visibility} onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'FOLLOWERS')}><option value="PUBLIC">Público</option><option value="FOLLOWERS">Seguidores</option></select></div>
              <div><small>{body.length}/12000</small><button className="primary-button" disabled={busy}>{busy ? 'Publicando…' : 'Publicar'}</button></div>
            </div>
          </div>
        </form> : <div className="post-login-card"><span>✦</span><div><strong>Participe da comunidade</strong><p>Entre para publicar atualizações, votar em enquetes e comentar.</p></div><Link className="primary-button" href={`/explore?auth=login&return=${encodeURIComponent('/posts')}`}>Entrar</Link></div>}

        <div className="community-tabs" role="tablist">
          {([['RECOMMENDED','Para você'],['FOLLOWING','Seguindo'],['RECENT','Recentes']] as const).map(([value,label]) => <button key={value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>{label}</button>)}
        </div>

        {message ? <div className="community-message" role="status">{message}</div> : null}
        {loading ? <div className="community-loading"><span /><p>Carregando posts…</p></div> : null}

        {!loading && posts.length ? <section className="post-feed">{posts.map((post) => {
          const votes = totalVotes(post)
          return <article className="community-post" key={post.id}>
            <header><Link className="post-avatar" href={`/users/${encodeURIComponent(post.author_username)}`}>{post.author_display_name.slice(0,1).toUpperCase()}</Link><div><Link href={`/users/${encodeURIComponent(post.author_username)}`}><strong>{post.author_display_name}</strong></Link><span>@{post.author_username} · {postDate(post.created_at)}</span></div>{post.visibility === 'FOLLOWERS' ? <small>Seguidores</small> : null}</header>
            {post.body ? <div className="post-body">{post.body}</div> : null}
            {post.image_urls.length ? <div className={`post-image-grid count-${post.image_urls.length}`}>{post.image_urls.map((url, index) => <a href={url} target="_blank" rel="noopener noreferrer" key={url}><img src={url} alt={`Imagem ${index + 1} do post`} /></a>)}</div> : null}
            {post.poll_question ? <div className="post-poll"><strong>{post.poll_question}</strong><div>{post.poll_options.map((option) => { const percent = votes ? Math.round(option.votes / votes * 100) : 0; const selected = post.viewer_poll_option === option.id; return <button key={option.id} className={selected ? 'selected' : ''} onClick={() => void vote(post.id, option.id)} disabled={!user}><span className="poll-fill" style={{ width: `${percent}%` }} /><span>{option.text}</span><b>{post.viewer_poll_option ? `${percent}%` : ''}</b></button> })}</div><small>{votes} voto{votes === 1 ? '' : 's'}{!user ? ' · entre para votar' : ''}</small></div> : null}
            <footer className="post-actions"><button className={post.liked ? 'active' : ''} onClick={() => void toggleLike(post)}><NovaIcon name="heart" size={17} /> <span>{post.likes_count}</span></button><button onClick={() => void loadComments(post.id)}><NovaIcon name="comment" size={17} /> <span>{post.comments_count}</span></button><button onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/posts#${post.id}`); setMessage('Link do post copiado.') }}><NovaIcon name="share" size={16} /> Compartilhar</button></footer>
            {openComments === post.id ? <section className="post-comments-panel">{post.comments_enabled ? <form onSubmit={(event) => void addComment(event, post.id)}><input name="comment" maxLength={10000} placeholder={user ? 'Adicionar comentário…' : 'Entre para comentar'} disabled={!user} /><button disabled={!user}>Enviar</button></form> : <p>Comentários desativados.</p>}<div>{(comments[post.id] || []).map((comment) => <article key={comment.id}><Link href={`/users/${encodeURIComponent(comment.username)}`}>{comment.display_name}</Link><p>{comment.body}</p><small>{postDate(comment.created_at)}</small></article>)}</div></section> : null}
          </article>
        })}</section> : null}

        {!loading && !posts.length ? <div className="studio-empty large"><span><NovaIcon name="posts" size={30} /></span><h2>Nenhum post por aqui ainda</h2><p>Quando a comunidade publicar novidades, elas aparecerão aqui.</p></div> : null}
      </main>
    </>
  )
}
