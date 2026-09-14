'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { WorkCardData } from '@/lib/types'

type LibraryState = 'TO_READ' | 'READING' | 'COMPLETED' | 'FAVORITE'
type LibraryEntry = WorkCardData & {
  library_state: LibraryState
  library_rating?: number | null
  library_note?: string | null
  last_chapter_id?: string | null
  progress?: number
  last_read_at?: string | null
}
type HistoryEntry = WorkCardData & {
  last_chapter_id?: string | null
  progress?: number
  completed?: boolean
  last_read_at?: string | null
}
type Shelf = { id:string; name:string; slug:string; description:string|null; visibility:string; count:number; updated_at:string }

const LABELS: Record<LibraryState,string> = {
  TO_READ:'Quero ler', READING:'Lendo', COMPLETED:'Concluídas', FAVORITE:'Favoritas',
}

export function LibraryPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null,[configured])
  const [user,setUser] = useState<User|null>(null)
  const [entries,setEntries] = useState<LibraryEntry[]>([])
  const [history,setHistory] = useState<HistoryEntry[]>([])
  const [shelves,setShelves] = useState<Shelf[]>([])
  const [tab,setTab] = useState<'ALL'|LibraryState|'HISTORY'>('ALL')
  const [loading,setLoading] = useState(true)
  const [message,setMessage] = useState('')

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    const current = (await supabase.auth.getUser()).data.user || null
    setUser(current)
    if (!current) { setLoading(false); return }
    const { data,error } = await supabase.rpc('my_library')
    if (error) { setMessage(error.message); setLoading(false); return }
    const payload = (data || {}) as { entries?:LibraryEntry[]; history?:HistoryEntry[]; shelves?:Shelf[] }
    setEntries(payload.entries || [])
    setHistory(payload.history || [])
    setShelves(payload.shelves || [])
    setLoading(false)
  },[supabase])

  useEffect(() => { void load() },[load])

  async function setState(workId:string,state:LibraryState) {
    if (!supabase) return
    const { error } = await supabase.rpc('set_library_state',{ target_work:workId,next_state:state })
    if (error) return setMessage(error.message)
    await load()
  }

  async function remove(workId:string) {
    if (!supabase) return
    await supabase.rpc('remove_from_library',{ target_work:workId })
    await load()
  }

  if (loading) return <><NovaHeader title="Biblioteca" /><main className="nova-library-page"><div className="studio-loading"><span /><h1>Abrindo sua biblioteca…</h1></div></main></>
  if (!user) return <><NovaHeader title="Biblioteca" /><main className="nova-library-page"><section className="library-gate"><span>✦</span><h1>Sua biblioteca mora na sua conta.</h1><p>Entre para sincronizar leituras, estantes e progresso entre dispositivos.</p><Link className="primary-button" href="/explore?auth=login&return=%2Flibrary">Entrar</Link></section></main></>

  const visible = tab === 'HISTORY' ? history : tab === 'ALL' ? entries : entries.filter(item => item.library_state === tab)

  return (
    <>
      <NovaHeader title="Biblioteca" />
      <main className="nova-library-page">
        <header className="library-hero">
          <div><p className="eyebrow">Biblioteca pessoal</p><h1>Suas histórias, do seu jeito.</h1><p>Continue de onde parou, organize por estado e monte estantes públicas, privadas ou não listadas.</p></div>
          <Link className="primary-button" href="/dashboard/library">Gerenciar estantes e séries</Link>
        </header>

        <section className="library-summary">
          <article><strong>{entries.length}</strong><span>na biblioteca</span></article>
          <article><strong>{entries.filter(x=>x.library_state==='READING').length}</strong><span>lendo agora</span></article>
          <article><strong>{entries.filter(x=>x.library_state==='COMPLETED').length}</strong><span>concluídas</span></article>
          <article><strong>{shelves.length}</strong><span>estantes</span></article>
        </section>

        <nav className="library-tabs" aria-label="Filtrar biblioteca">
          <button className={tab==='ALL'?'active':''} onClick={()=>setTab('ALL')}>Todas</button>
          {(Object.keys(LABELS) as LibraryState[]).map(state=><button key={state} className={tab===state?'active':''} onClick={()=>setTab(state)}>{LABELS[state]}</button>)}
          <button className={tab==='HISTORY'?'active':''} onClick={()=>setTab('HISTORY')}>Histórico</button>
        </nav>

        {visible.length ? <section className="library-grid">
          {visible.map(item => {
            const state = 'library_state' in item ? item.library_state : null
            const progress = Number(item.progress || 0)
            const workHref = '/works/' + item.id + (item.last_chapter_id ? '?chapter=' + encodeURIComponent(item.last_chapter_id) : '')
            return <article className="library-work-card" key={tab + '-' + item.id}>
              <div className="library-card-top">
                <span className="rating-badge">{item.rating==='GENERAL'?'G':item.rating==='TEEN'?'T':item.rating==='MATURE'?'M':item.rating==='EXPLICIT'?'E':'?'}</span>
                <small>{item.fandoms?.[0] || 'História'}</small>
              </div>
              <h2><Link href={'/works/' + item.id}>{item.title}</Link></h2>
              <p>por <Link href={'/users/' + encodeURIComponent(item.author_username)}>@{item.author_username}</Link></p>
              <div className="library-progress"><span style={{width: Math.max(2,Math.min(progress,100)) + '%'}} /><b>{Math.round(progress)}%</b></div>
              <div className="library-card-meta"><span>{item.chapter_count} cap.</span><span>{item.word_count.toLocaleString('pt-BR')} palavras</span></div>
              <footer>
                <Link className="primary-button" href={workHref}>{progress>0?'Continuar':'Ler'}</Link>
                {state ? <select aria-label="Estado na biblioteca" value={state} onChange={e=>void setState(item.id,e.target.value as LibraryState)}>
                  {(Object.keys(LABELS) as LibraryState[]).map(value=><option key={value} value={value}>{LABELS[value]}</option>)}
                </select> : null}
                {state ? <button className="ghost-button" onClick={()=>void remove(item.id)}>Remover</button> : null}
              </footer>
            </article>
          })}
        </section> : <section className="library-empty"><span>☾</span><h2>Nada aqui ainda.</h2><p>Explore o arquivo e adicione histórias à sua biblioteca.</p><Link className="primary-button" href="/explore">Explorar histórias</Link></section>}

        {shelves.length ? <section className="library-shelves"><header><div><p className="eyebrow">Estantes</p><h2>Coleções com personalidade</h2></div><Link href="/dashboard/library">Gerenciar</Link></header><div>{shelves.map(shelf=><Link key={shelf.id} href={'/shelves/' + shelf.id}><strong>{shelf.name}</strong><span>{shelf.count} obras · {shelf.visibility==='PRIVATE'?'privada':shelf.visibility==='UNLISTED'?'não listada':'pública'}</span></Link>)}</div></section> : null}
        {message ? <div className="reader-page-toast" role="status">{message}</div> : null}
      </main>
    </>
  )
}
