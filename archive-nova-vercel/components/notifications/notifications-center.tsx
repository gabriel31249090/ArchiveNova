'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon, type NovaIconName } from '@/components/ui/nova-icon'
import type { NotificationItem } from '@/lib/types'

type Category='ALL'|'SOCIAL'|'COMMENTS'|'UPDATES'|'SYSTEM'

function labelFor(item:NotificationItem):{icon:NovaIconName;title:string;body:string;category:Category}{
  const actor=item.actor_display_name||item.actor_username||'Alguém'
  if(item.type==='KUDOS')return{icon:'heart',title:actor+' deixou kudos',body:item.work_title?'em “'+item.work_title+'”':'em uma das suas obras.',category:'SOCIAL'}
  if(item.type==='COMMENT')return{icon:'comment',title:actor+' comentou',body:item.work_title?'em “'+item.work_title+'”':'em uma das suas obras.',category:'COMMENTS'}
  if(item.type==='COMMENT_REPLY')return{icon:'reply',title:actor+' respondeu seu comentário',body:item.work_title?'em “'+item.work_title+'”':'',category:'COMMENTS'}
  if(item.type==='NEW_FOLLOWER')return{icon:'plus',title:actor+' começou a seguir você',body:'Um novo leitor entrou no seu arquivo.',category:'SOCIAL'}
  if(item.type==='NEW_CHAPTER')return{icon:'write',title:'Novo capítulo publicado',body:item.work_title?'“'+item.work_title+'” foi atualizada.':'Uma obra que você acompanha foi atualizada.',category:'UPDATES'}
  if(item.type.includes('COLLAB')||item.type.includes('CONTRIB')||item.type.includes('BETA'))return{icon:'branch',title:'Atividade de colaboração',body:actor+' enviou uma atualização para você.',category:'UPDATES'}
  if(item.type.includes('REPORT')||item.type.includes('MODERAT'))return{icon:'shield',title:'Atualização de moderação',body:item.work_title||'Há uma atualização administrativa no seu arquivo.',category:'SYSTEM'}
  return{icon:'bell',title:'Nova atividade',body:item.work_title||'',category:'SYSTEM'}
}

function relativeDate(value:string){
  const diff=Date.now()-new Date(value).getTime()
  const minutes=Math.floor(diff/60000)
  if(minutes<1)return'agora'
  if(minutes<60)return'há '+minutes+' min'
  const hours=Math.floor(minutes/60)
  if(hours<24)return'há '+hours+' h'
  const days=Math.floor(hours/24)
  if(days<7)return'há '+days+' d'
  return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(value))
}

function groupLabel(value:string){
  const date=new Date(value)
  const now=new Date()
  const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()
  const startItem=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime()
  const days=Math.round((startToday-startItem)/86400000)
  if(days<=0)return'Hoje'
  if(days===1)return'Ontem'
  if(days<7)return'Esta semana'
  return'Anteriores'
}

const CATEGORIES:Array<{key:Category;label:string}>=[
  {key:'ALL',label:'Todas'},
  {key:'SOCIAL',label:'Social'},
  {key:'COMMENTS',label:'Comentários'},
  {key:'UPDATES',label:'Atualizações'},
  {key:'SYSTEM',label:'Sistema'},
]

export function NotificationsCenter(){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const [user,setUser]=useState<User|null>(null)
  const [items,setItems]=useState<NotificationItem[]>([])
  const [unread,setUnread]=useState(0)
  const [onlyUnread,setOnlyUnread]=useState(false)
  const [category,setCategory]=useState<Category>('ALL')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  async function load(filter=onlyUnread){
    if(!supabase){setLoading(false);return}
    setLoading(true)
    const current=(await supabase.auth.getUser()).data.user||null
    setUser(current)
    if(!current){setLoading(false);return}
    const {data,error:feedError}=await supabase.rpc('notifications_feed',{limit_count:100,unread_only:filter})
    if(feedError){
      console.error(feedError);setError('Não foi possível carregar as notificações.');setLoading(false);return
    }
    const payload=(data||{}) as {items?:NotificationItem[];unread_count?:number}
    setItems(payload.items||[])
    setUnread(Number(payload.unread_count||0))
    setError('')
    setLoading(false)
  }

  useEffect(()=>{void load(onlyUnread)},[supabase,onlyUnread])

  async function markAll(){
    if(!supabase)return
    await supabase.rpc('mark_all_notifications_read')
    await load(onlyUnread)
  }

  async function openNotification(item:NotificationItem){
    if(!supabase)return
    if(!item.read_at){
      await supabase.rpc('mark_notification_read',{target_notification:item.id})
      setItems(current=>current.map(entry=>entry.id===item.id?{...entry,read_at:new Date().toISOString()}:entry))
      setUnread(current=>Math.max(0,current-1))
    }
    if(item.work_id)window.location.href='/works/'+item.work_id
    else if(item.actor_username)window.location.href='/users/'+encodeURIComponent(item.actor_username)
  }

  const filtered=items.filter(item=>category==='ALL'||labelFor(item).category===category)
  const grouped=filtered.reduce<Record<string,NotificationItem[]>>((acc,item)=>{
    const label=groupLabel(item.created_at)
    ;(acc[label]??=[]).push(item)
    return acc
  },{})
  const groupOrder=['Hoje','Ontem','Esta semana','Anteriores']

  if(loading&&!user)return <><NovaHeader title="Notificações"/><main className="notifications-page"><div className="studio-loading"><span/><h1>Carregando atividade…</h1></div></main></>
  if(!loading&&!user)return <><NovaHeader title="Notificações"/><main className="notifications-page"><div className="studio-gate"><span><NovaIcon name="bell" size={34}/></span><h1>Entre para ver sua atividade.</h1><p>Kudos, comentários, seguidores e novos capítulos aparecem aqui.</p><Link className="primary-button" href="/explore?auth=login&return=/notifications">Entrar</Link></div></main></>

  return <>
    <NovaHeader title="Notificações"/>
    <main className="notifications-page notifications-v47">
      <section className="notifications-head">
        <div><p className="eyebrow">Notificações 2.0</p><h1>Sua atividade, sem ruído.</h1><p>Filtre conversas, atualizações e atividade social sem perder o que realmente importa.</p></div>
        <div className="notifications-head-actions">
          <button className={'secondary-button '+(onlyUnread?'active':'')} onClick={()=>setOnlyUnread(value=>!value)}>{onlyUnread?'Mostrando não lidas':'Somente não lidas'}</button>
          <button className="primary-button" disabled={!unread} onClick={()=>void markAll()}>Marcar todas como lidas</button>
        </div>
      </section>

      {error?<div className="studio-alert error">{error}</div>:null}

      <section className="notifications-v47-dashboard">
        <div className="notifications-summary">
          <span className="notification-orb"><NovaIcon name="bell" size={24}/>{unread>0?<i/>:null}</span>
          <div><strong>{unread}</strong><span>não lida{unread===1?'':'s'}</span></div>
        </div>
        <div className="notifications-category-tabs" role="tablist" aria-label="Categorias de notificações">
          {CATEGORIES.map(item=>{
            const count=item.key==='ALL'?items.length:items.filter(notification=>labelFor(notification).category===item.key).length
            return <button key={item.key} className={category===item.key?'active':''} onClick={()=>setCategory(item.key)}><span>{item.label}</span><b>{count}</b></button>
          })}
        </div>
      </section>

      {loading?<div className="studio-loading compact"><span/><h2>Atualizando…</h2></div>:null}

      {!loading?<section className="notifications-grouped-v47">
        {groupOrder.map(group=>{
          const rows=grouped[group]||[]
          if(!rows.length)return null
          return <section key={group} className="notification-group-v47">
            <header><h2>{group}</h2><span>{rows.length}</span></header>
            <div className="notification-list">
              {rows.map(item=>{
                const copy=labelFor(item)
                const solid=copy.icon==='heart'&&!item.read_at
                return <button className={'notification-row '+(item.read_at?'':'unread')} key={item.id} onClick={()=>void openNotification(item)}>
                  <span className={'notification-icon category-'+copy.category.toLowerCase()}><NovaIcon name={copy.icon} size={20} variant={solid?'solid':'outline'}/></span>
                  <div className="notification-copy"><div><strong>{copy.title}</strong>{!item.read_at?<i/>:null}</div><p>{copy.body}</p><small>{relativeDate(item.created_at)}</small></div>
                  <span className="notification-arrow"><NovaIcon name="arrowRight" size={16}/></span>
                </button>
              })}
            </div>
          </section>
        })}
        {!filtered.length?<div className="studio-empty large"><span><NovaIcon name="bell" size={30}/></span><h2>{onlyUnread?'Tudo lido':'Nenhuma atividade nesta categoria'}</h2><p>{onlyUnread?'Você está em dia com sua atividade.':'Quando algo correspondente acontecer, aparecerá aqui.'}</p></div>:null}
      </section>:null}
    </main>
  </>
}
