'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'

type QueueItem={id:number;code:string;category:string;priority:string;status:string;subject:string;assigned_to:string|null;last_message_at:string;created_at:string;requester_username:string;requester_display_name:string;assigned_username:string|null;message_count:number}
type Message={id:number;author_role:'USER'|'STAFF'|'SYSTEM';author_username:string|null;author_display_name:string|null;body:string;created_at:string}
type TicketPayload={ticket:{id:number;code:string;category:string;priority:string;status:string;subject:string;assigned_to:string|null;created_at:string;updated_at:string};messages:Message[]}

const STATUSES=['OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED']
const PRIORITIES=['LOW','NORMAL','HIGH','URGENT']
function dt(value:string){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}

export function NovaCareStaff(){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const [user,setUser]=useState<User|null>(null)
  const [role,setRole]=useState('USER')
  const [queue,setQueue]=useState<QueueItem[]>([])
  const [selected,setSelected]=useState<TicketPayload|null>(null)
  const [filter,setFilter]=useState('')
  const [reply,setReply]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  async function loadQueue(nextFilter=filter){
    if(!supabase)return
    const {data,error:rpcError}=await supabase.rpc('support_staff_queue',{status_filter:nextFilter||null,limit_count:150})
    if(rpcError){setError('Não foi possível carregar a fila do SAC.');return}
    setQueue((data||[]) as QueueItem[])
  }
  async function loadTicket(id:number){
    if(!supabase)return
    setBusy('ticket-'+id)
    const {data,error:rpcError}=await supabase.rpc('get_support_ticket',{target_ticket:id})
    setBusy('')
    if(rpcError){setError('Não foi possível abrir esse chamado.');return}
    setSelected(data as TicketPayload)
  }

  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    let active=true
    void (async()=>{
      const current=(await supabase.auth.getUser()).data.user||null
      if(!active)return
      setUser(current)
      if(!current){setLoading(false);return}
      const {data:profile}=await supabase.from('profiles').select('role').eq('id',current.id).maybeSingle()
      const nextRole=String(profile?.role||'USER')
      if(!active)return
      setRole(nextRole)
      if(nextRole==='ADMIN'||nextRole==='MODERATOR')await loadQueue('')
      if(active)setLoading(false)
    })()
    return()=>{active=false}
  },[supabase])

  async function updateTicket(status?:string,priority?:string,assign=false){
    if(!supabase||!selected)return
    setBusy('update');setError('')
    const {error:rpcError}=await supabase.rpc('support_staff_update_ticket',{target_ticket:selected.ticket.id,next_status:status||null,next_priority:priority||null,assign_to_self:assign})
    setBusy('')
    if(rpcError){setError('Não foi possível atualizar o chamado.');return}
    await Promise.all([loadTicket(selected.ticket.id),loadQueue()])
    setNotice('Chamado atualizado.')
  }
  async function sendReply(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!supabase||!selected||!reply.trim())return
    setBusy('reply')
    const {error:rpcError}=await supabase.rpc('reply_support_ticket',{target_ticket:selected.ticket.id,message_body:reply.trim()})
    setBusy('')
    if(rpcError){setError('Não foi possível responder.');return}
    setReply('')
    await Promise.all([loadTicket(selected.ticket.id),loadQueue()])
  }

  if(loading)return <><NovaHeader title="NovaCare Staff"/><main className="novacare-page"><div className="studio-loading"><span/><h1>Abrindo fila…</h1></div></main></>
  if(!user||!['ADMIN','MODERATOR'].includes(role))return <><NovaHeader title="NovaCare Staff"/><main className="novacare-page"><section className="studio-gate"><span><NovaIcon name="shield" size={32}/></span><h1>Área restrita.</h1><p>Somente moderadores e administradores podem responder chamados.</p><Link className="primary-button" href="/sac">Ir para meu SAC</Link></section></main></>

  return <>
    <NovaHeader title="NovaCare Staff"/>
    <main className="novacare-page staff">
      <section className="novacare-hero staff nova-glow-surface"><div><p className="eyebrow">NovaCare · Atendimento</p><h1>Central de chamados</h1><p>Priorize casos urgentes, assuma atendimentos e mantenha decisões registradas.</p></div><Link className="secondary-button" href="/moderation"><NovaIcon name="shield" size={16}/> Moderação</Link></section>
      {error?<div className="studio-alert error">{error}</div>:null}
      {notice?<div className="studio-alert success">{notice}</div>:null}

      <div className="novacare-staff-toolbar">
        <div className="segmented"><button className={!filter?'active':''} onClick={()=>{setFilter('');void loadQueue('')}}>Todos</button>{STATUSES.slice(0,4).map(item=><button key={item} className={filter===item?'active':''} onClick={()=>{setFilter(item);void loadQueue(item)}}>{item.replaceAll('_',' ')}</button>)}</div>
        <strong>{queue.length} chamados</strong>
      </div>

      <div className="novacare-layout staff">
        <aside className="novacare-list">{queue.length?queue.map(item=><button key={item.id} className={selected?.ticket.id===item.id?'active':''} onClick={()=>void loadTicket(item.id)}>
          <div><span>{item.code}</span><b className={'ticket-priority '+item.priority.toLowerCase()}>{item.priority}</b></div>
          <strong>{item.subject}</strong><small>{item.requester_display_name+' · '+item.status.replaceAll('_',' ')+' · '+dt(item.last_message_at)}</small>
        </button>):<div className="novacare-empty"><NovaIcon name="check" size={25}/><strong>Fila limpa</strong><span>Nenhum chamado neste filtro.</span></div>}</aside>

        <section className="novacare-thread">
          {selected?<><header><div><span>{selected.ticket.code+' · '+selected.ticket.category}</span><h2>{selected.ticket.subject}</h2></div><b className={'ticket-status '+selected.ticket.status.toLowerCase()}>{selected.ticket.status.replaceAll('_',' ')}</b></header>
            <div className="novacare-staff-controls">
              <button className="secondary-button" disabled={busy==='update'} onClick={()=>void updateTicket(undefined,undefined,true)}>Assumir</button>
              <select value={selected.ticket.priority} onChange={e=>void updateTicket(undefined,e.target.value,false)}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
              <select value={selected.ticket.status} onChange={e=>void updateTicket(e.target.value,undefined,false)}>{STATUSES.map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select>
            </div>
            <div className="novacare-messages">{selected.messages.map(message=><article className={'novacare-message '+message.author_role.toLowerCase()} key={message.id}><div><strong>{message.author_role==='STAFF'?'Equipe · '+(message.author_display_name||message.author_username||'Staff'):message.author_display_name||message.author_username||'Sistema'}</strong><small>{dt(message.created_at)}</small></div><p>{message.body}</p></article>)}</div>
            <form className="novacare-reply" onSubmit={sendReply}><textarea value={reply} onChange={e=>setReply(e.target.value)} rows={4} placeholder="Resposta da equipe…" maxLength={12000}/><button className="primary-button" disabled={busy==='reply'||!reply.trim()}>{busy==='reply'?'Enviando…':'Responder como equipe'}</button></form>
          </>:<div className="novacare-thread-empty"><span>✦</span><h2>Selecione um chamado</h2><p>Os controles de atendimento aparecerão aqui.</p></div>}
        </section>
      </div>
    </main>
  </>
}
