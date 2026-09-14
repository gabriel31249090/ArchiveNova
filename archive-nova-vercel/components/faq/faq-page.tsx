'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'
import { useNovaConfirm } from '@/components/ui/nova-confirm'

type FAQ = { id: string; category: string; question: string; answer: string; position: number; published?: boolean }

export function FAQPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const { ask: confirmAction, dialog: confirmDialog } = useNovaConfirm()
  const [items, setItems] = useState<FAQ[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isStaff, setIsStaff] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [editing, setEditing] = useState<FAQ | null>(null)

  async function load() {
    if (!supabase) { setLoading(false); return }
    const user = (await supabase.auth.getUser()).data.user
    let staff = false
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      staff = profile?.role === 'ADMIN' || profile?.role === 'MODERATOR'
    }
    setIsStaff(staff)
    const request = supabase.from('faq_items').select('id,category,question,answer,position,published').order('position')
    const { data } = staff ? await request : await request.eq('published', true)
    setItems((data || []) as FAQ[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [supabase])

  const filtered = items.filter((item) => item.published !== false || isStaff).filter((item) => `${item.category} ${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase()))
  const categories = [...new Set(filtered.filter((item) => item.published !== false || isStaff).map((item) => item.category))]

  async function saveFAQ(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !isStaff) return
    const form = event.currentTarget
    const data = new FormData(form)
    const payload = {
      category: String(data.get('category') || 'Geral').trim() || 'Geral',
      question: String(data.get('question') || '').trim(),
      answer: String(data.get('answer') || '').trim(),
      position: Number(data.get('position') || 0),
      published: data.get('published') === 'on',
    }
    if (!payload.question || !payload.answer) { setAdminMessage('Pergunta e resposta são obrigatórias.'); return }
    setAdminMessage('Salvando…')
    const result = editing
      ? await supabase.from('faq_items').update(payload).eq('id', editing.id)
      : await supabase.from('faq_items').insert(payload)
    if (result.error) { console.error(result.error); setAdminMessage('Não foi possível salvar a pergunta.') }
    else { form.reset(); setEditing(null); setAdminMessage(editing ? 'Pergunta atualizada.' : 'Pergunta criada.'); await load() }
  }

  async function removeFAQ(item: FAQ) {
    if (!supabase || !isStaff) return
    if (!(await confirmAction({
      title: 'Excluir esta pergunta?',
      description: item.question,
      confirmLabel: 'Excluir pergunta',
      tone: 'danger',
    }))) return
    const { error } = await supabase.from('faq_items').delete().eq('id', item.id)
    if (error) { setAdminMessage('Não foi possível excluir.') }
    else { setAdminMessage('Pergunta excluída.'); await load() }
  }

  async function togglePublished(item: FAQ) {
    if (!supabase || !isStaff) return
    const { error } = await supabase.from('faq_items').update({ published: item.published === false }).eq('id', item.id)
    if (error) setAdminMessage('Não foi possível alterar a visibilidade.')
    else await load()
  }

  return (
    <>
      <NovaHeader title="FAQ" />
      <main className="faq-page">
        <section className="faq-hero"><div><p className="eyebrow">Central de ajuda</p><h1>Perguntas frequentes</h1><p>Respostas rápidas sobre conta, escrita, publicação, comunidade, apoio e publicidade.</p></div><label className="faq-search"><span><NovaIcon name="search" size={18} /></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar uma dúvida…" /></label></section>
        {loading ? <div className="community-loading"><span /><p>Carregando ajuda…</p></div> : null}
        {!loading ? <div className="faq-layout"><aside>{categories.map((category) => <a key={category} href={`#faq-${category.replace(/\s+/g,'-').toLowerCase()}`}>{category}</a>)}<Link href="/support">Apoiar o projeto</Link><Link href="/advertise">Publicidade</Link></aside><section className="faq-list">{categories.map((category) => <div className="faq-category" id={`faq-${category.replace(/\s+/g,'-').toLowerCase()}`} key={category}><p className="eyebrow">{category}</p>{filtered.filter((item) => item.category === category).map((item) => <article className={open === item.id ? 'open' : ''} key={item.id}><button onClick={() => setOpen((current) => current === item.id ? null : item.id)} aria-expanded={open === item.id}><span>{item.question}{item.published === false ? <small className="faq-draft-badge">rascunho</small> : null}</span><b>{open === item.id ? '−' : '＋'}</b></button>{open === item.id ? <div className="faq-answer"><p>{item.answer}</p>{isStaff ? <div className="faq-admin-actions"><button onClick={() => setEditing(item)}>Editar</button><button onClick={() => void togglePublished(item)}>{item.published === false ? 'Publicar' : 'Ocultar'}</button><button className="danger" onClick={() => void removeFAQ(item)}>Excluir</button></div> : null}</div> : null}</article>)}</div>)}</section></div> : null}
        {!loading && !filtered.length ? <div className="studio-empty large"><span>?</span><h2>Nada encontrado</h2><p>Tente pesquisar com outras palavras.</p></div> : null}

        {isStaff ? <section className="faq-admin-panel"><header><div><p className="eyebrow">Administração</p><h2>{editing ? 'Editar pergunta' : 'Nova pergunta'}</h2></div>{editing ? <button className="secondary-button" onClick={() => setEditing(null)}>Cancelar edição</button> : null}</header><form key={editing?.id || 'new'} onSubmit={saveFAQ}><div className="two-columns"><label>Categoria<input name="category" defaultValue={editing?.category || 'Geral'} maxLength={80} required /></label><label>Posição<input name="position" type="number" defaultValue={editing?.position ?? items.length * 10 + 10} /></label></div><label>Pergunta<input name="question" defaultValue={editing?.question || ''} maxLength={300} required /></label><label>Resposta<textarea name="answer" defaultValue={editing?.answer || ''} rows={5} required /></label><label className="support-enable"><input name="published" type="checkbox" defaultChecked={editing?.published !== false} /><span><strong>Publicada</strong><small>Se desmarcado, somente a equipe poderá visualizar.</small></span></label><footer><span>{adminMessage}</span><button className="primary-button">{editing ? 'Salvar alterações' : 'Adicionar ao FAQ'}</button></footer></form></section> : null}

        <section className="faq-contact"><span>✦</span><div><h2>Ainda ficou com dúvida?</h2><p>Use a comunidade ou consulte as configurações da sua conta.</p></div><Link className="primary-button" href="/posts">Perguntar à comunidade</Link></section>
        {confirmDialog}
      </main>
    </>
  )
}
