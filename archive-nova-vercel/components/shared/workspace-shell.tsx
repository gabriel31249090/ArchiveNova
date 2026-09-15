'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaIcon } from '@/components/ui/nova-icon'

type FandomLink = { id:string; name:string; slug:string }

export function WorkspaceShell({
  active,
  fandoms = [],
  topbar,
  children,
}:{
  active:'home'|'explore'
  fandoms?:FandomLink[]
  topbar?:ReactNode
  children:ReactNode
}){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const [sidebarOpen,setSidebarOpen]=useState(false)
  const [theme,setTheme]=useState<'light'|'dark'>('light')
  const [profile,setProfile]=useState<{username:string;display_name:string|null}|null>(null)

  useEffect(()=>{
    const saved=window.localStorage.getItem('archiveNovaTheme')
    const next=saved==='dark'?'dark':'light'
    setTheme(next)
    document.documentElement.dataset.theme=next
  },[])

  useEffect(()=>{
    if(!supabase)return
    let activeRequest=true
    void supabase.auth.getUser().then(async({data})=>{
      if(!activeRequest||!data.user)return
      const {data:row}=await supabase.from('profiles').select('username,display_name').eq('id',data.user.id).maybeSingle()
      if(activeRequest&&row)setProfile({username:String(row.username||''),display_name:row.display_name?String(row.display_name):null})
    })
    return()=>{activeRequest=false}
  },[supabase])

  function toggleTheme(){
    const next=theme==='dark'?'light':'dark'
    setTheme(next)
    document.documentElement.dataset.theme=next
    window.localStorage.setItem('archiveNovaTheme',next)
  }

  return <>
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    <div className="app-shell novadrop-shell">
      <aside className={`sidebar ${sidebarOpen?'open':''}`} aria-label="Navegação principal">
        <Link className="brand brand-link" href="/" aria-label="Voltar para a página inicial">
          <div className="brand-mark" aria-hidden="true">✦</div>
          <div><strong>Archive Nova</strong><span>histórias, bem organizadas</span></div>
        </Link>

        <nav className="nav-stack">
          <Link className={`nav-item ${active==='home'?'active':''}`} href="/home"><span><NovaIcon name="archive" size={18}/></span> Início</Link>
          <Link className={`nav-item ${active==='explore'?'active':''}`} href="/explore"><span><NovaIcon name="search" size={18}/></span> Explorar</Link>
          <Link className="nav-item" href="/feed"><span><NovaIcon name="feed" size={18}/></span> Feed</Link>
          <Link className="nav-item" href="/posts"><span><NovaIcon name="posts" size={18}/></span> Posts</Link>
          <Link className="nav-item" href="/library"><span><NovaIcon name="book" size={18}/></span> Minha biblioteca</Link>
          <Link className="nav-item" href="/dashboard"><span><NovaIcon name="studio" size={18}/></span> Creator Studio</Link>
          <Link className="nav-item" href="/notifications"><span><NovaIcon name="bell" size={18}/></span> Notificações</Link>
          <Link className="nav-item" href="/faq"><span><NovaIcon name="help" size={18}/></span> FAQ</Link>
        </nav>

        <div className="sidebar-section">
          <p className="eyebrow">Fandoms ativos</p>
          <div className="dynamic-links">
            {fandoms.slice(0,6).map(fandom=><Link className="mini-link" key={fandom.id} href={`/fandoms/${encodeURIComponent(fandom.slug)}`}>{fandom.name}</Link>)}
            {!fandoms.length?<span className="muted-small">O arquivo está carregando…</span>:null}
          </div>
        </div>

        <div className="sidebar-bottom">
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="Alternar tema">
            <span>{theme==='dark'?<NovaIcon name="sun" size={18}/>:<NovaIcon name="moon" size={18}/>}</span>
            <span>{theme==='dark'?'Tema claro':'Tema escuro'}</span>
          </button>
          {profile?
            <Link className="profile-mini profile-button" href={`/users/${encodeURIComponent(profile.username)}`}>
              <div className="avatar">{profile.username.slice(0,1).toUpperCase()}</div>
              <div><strong>{profile.display_name||profile.username}</strong><span>@{profile.username}</span></div>
              <span aria-hidden="true">•••</span>
            </Link>
          :
            <Link className="profile-mini profile-button" href="/explore?auth=login">
              <div className="avatar">?</div>
              <div><strong>Entrar</strong><span>ou criar uma conta</span></div>
              <span aria-hidden="true">→</span>
            </Link>
          }
        </div>
      </aside>

      <main className="main" id="main">
        <header className="topbar novadrop-topbar">
          <button className="icon-button menu-button" type="button" onClick={()=>setSidebarOpen(v=>!v)} aria-label={sidebarOpen?'Fechar menu':'Abrir menu'}><NovaIcon name="menu" size={20}/></button>
          {topbar||<form className="global-search" action="/explore"><span aria-hidden="true"><NovaIcon name="search" size={18}/></span><input name="q" type="search" placeholder="Buscar obras, autores, fandoms ou tags…" autoComplete="off"/><kbd>Ctrl K</kbd></form>}
          <Link className="primary-button nova-button-with-icon" href="/write"><NovaIcon name="write" size={17}/> Escrever</Link>
        </header>
        {children}
      </main>
    </div>
  </>
}
