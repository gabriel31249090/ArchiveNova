'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'

type TicketSummary={id:number;code:string;category:string;priority:string;status:string;subject:string;last_message_at:string;created_at:string;unread_staff_messages:number}
type TicketMessage={id:number;author_role:'USER'|'STAFF'|'SYSTEM';author_username:string|null;author_display_name:string|null;body:string;created_at:string}
type TicketPayload={ticket:{id:number;code:string;category:string;priority:string;status:string;subject:string;created_at:string;updated_at:string};messages:TicketMessage[]}

const CATEGORIES=[['ACCOUNT','Conta e acesso'],['CONTENT','Obras e conteúdo'],['BUG','Erro / bug'],['MODERATION','Moderação'],['PRIVACY','Privacidade'],['BILLING','Pagamento / apoio'],['SUGGESTION','Sugestão'],['OTHER','Outro']] as const
const STATUS_LABEL:Record<string,string>={OPEN:'Aberto',WAITING_USER:'Aguardando você',IN_PROGRESS:'Em atendimento',RESOLVED:'Resolvido',CLOSED:'Encerrado'}
function dateTime(value:string){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}

export function NovaCareCenter(){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const [user,setUser]=useState<User|null>(null)
  const [tickets,setTickets]=useState<TicketSummary[]>([])
  const [selected,setSelected]=useState<TicketPayload|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [composerOpen,setComposerOpen]=useState(false)
  const [category,setCategory]=useState('BUG')
  const [subject,setSubject]=useState('')
  const [body,setBody]=useState('')
  const [reply,setReply]=useState('')

  async function loadTickets(){
    if(!supabase)return
    const {data,error:rpcError}=await supabase.rpc('my_support_tickets')
    if(rpcError){setError('Não foi possível carregar seus chamados.');return}
    setTickets((data||[]) as TicketSummary[])
  }
  async function loadTicket(id:number){
    if(!supabase)return
    setBusy('ticket-'+id);setError('')
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
      if(current)await loadTickets()
      if(active)setLoading(false)
    })()
    return()=>{active=false}
  },[supabase])

  async function createTicket(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!supabase)return
    setBusy('create');setError('');setNotice('')
    const {data,error:rpcError}=await supabase.rpc('create_support_ticket',{ticket_category:category,ticket_subject:subject.trim(),ticket_body:body.trim()})
    setBusy('')
    if(rpcError){setError(rpcError.message?.includes('RATE_LIMITED')?'Você abriu muitos chamados em pouco tempo. Tente novamente mais tarde.':'Não foi possível abrir o chamado.');return}
    setSubject('');setBody('');setComposerOpen(false)
    await loadTickets()
    if(data)await loadTicket(Number(data))
    setNotice('Chamado aberto. A equipe poderá responder por aqui.')
  }
  async function sendReply(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!supabase||!selected||!reply.trim())return
    setBusy('reply');setError('')
    const {error:rpcError}=await supabase.rpc('reply_support_ticket',{target_ticket:selected.ticket.id,message_body:reply.trim()})
    setBusy('')
    if(rpcError){setError('Não foi possível enviar a mensagem.');return}
    setReply('')
    await Promise.all([loadTicket(selected.ticket.id),loadTickets()])
  }

  if(loading)return <><NovaHeader title="SAC"/><main className="novacare-page"><div className="studio-loading"><span/><h1>Abrindo NovaCare…</h1></div></main></>
  if(!user)return <><NovaHeader title="SAC"/><main className="novacare-page"><section className="novacare-gate"><span><NovaIcon name="help" size={34}/></span><p className="eyebrow">NovaCare</p><h1>Suporte dentro do Archive Nova.</h1><p>Entre para abrir chamados, acompanhar respostas e manter todo o histórico do atendimento em um só lugar.</p><Link className="primary-button large" href="/explore?auth=login&return=/sac">Entrar para abrir chamado</Link></section></main></>

  return <>
    <NovaHeader title="SAC"/>
    <main className="novacare-page">
      <section className="novacare-hero nova-glow-surface">
        <div><p className="eyebrow">NovaCare · SAC</p><h1>Como podemos ajudar?</h1><p>Conta, bugs, moderação, privacidade ou sugestões: abra um chamado e acompanhe a conversa sem depender de e-mail perdido.</p></div>
        <button className="primary-button large" onClick={()=>setComposerOpen(true)}><NovaIcon name="plus" size={17}/> Novo chamado</button>
      </section>
      {error?<div className="studio-alert error">{error}</div>:null}
      {notice?<div className="studio-alert success">{notice}</div>:null}

      <div className="novacare-layout">
        <aside className="novacare-list">
          <header><div><p className="eyebrow">Meus chamados</p><strong>{tickets.length}</strong></div></header>
          {tickets.length?tickets.map(ticket=><button key={ticket.id} className={selected?.ticket.id===ticket.id?'active':''} onClick={()=>void loadTicket(ticket.id)}>
            <div><span>{ticket.code}</span><b className={'ticket-status '+ticket.status.toLowerCase()}>{STATUS_LABEL[ticket.status]||ticket.status}</b></div>
            <strong>{ticket.subject}</strong>
            <small>{dateTime(ticket.last_message_at)}{ticket.unread_staff_messages?' · '+ticket.unread_staff_messages+' nova(s)':''}</small>
          </button>):<div className="novacare-empty"><NovaIcon name="check" size={25}/><strong>Nenhum chamado</strong><span>Quando precisar, abra um atendimento aqui.</span></div>}
        </aside>

        <section className="novacare-thread">
          {selected?<><header><div><span>{selected.ticket.code+' · '+selected.ticket.category}</span><h2>{selected.ticket.subject}</h2></div><b className={'ticket-status '+selected.ticket.status.toLowerCase()}>{STATUS_LABEL[selected.ticket.status]||selected.ticket.status}</b></header>
            <div className="novacare-messages">{selected.messages.map(message=><article className={'novacare-message '+message.author_role.toLowerCase()} key={message.id}>
              <div><strong>{message.author_role==='STAFF'?'Equipe Archive Nova':message.author_display_name||message.author_username||'Sistema'}</strong><small>{dateTime(message.created_at)}</small></div>
              <p>{message.body}</p>
            </article>)}</div>
            {selected.ticket.status!=='CLOSED'?<form className="novacare-reply" onSubmit={sendReply}><textarea value={reply} onChange={e=>setReply(e.target.value)} rows={4} placeholder="Escreva uma resposta…" maxLength={12000}/><button className="primary-button" disabled={busy==='reply'||!reply.trim()}>{busy==='reply'?'Enviando…':'Enviar resposta'}</button></form>:<div className="studio-alert">Este chamado foi encerrado.</div>}
          </>:<div className="novacare-thread-empty"><span>✦</span><h2>Selecione um chamado</h2><p>O histórico completo da conversa aparecerá aqui.</p></div>}
        </section>
      </div>

      {composerOpen?<div className="nova-modal-backdrop" role="presentation" onMouseDown={()=>setComposerOpen(false)}><form className="nova-modal novacare-compose" onSubmit={createTicket} onMouseDown={e=>e.stopPropagation()}>
        <header><div><p className="eyebrow">Novo chamado</p><h2>Fale com o Archive Nova</h2></div><button type="button" className="icon-button" onClick={()=>setComposerOpen(false)}><NovaIcon name="close" size={18}/></button></header>
        <label>Categoria<select value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Assunto<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={180} required placeholder="Resuma o problema"/></label>
        <label>Explique o que aconteceu<textarea value={body} onChange={e=>setBody(e.target.value)} rows={7} minLength={10} maxLength={12000} required placeholder="Inclua detalhes que ajudem a equipe a reproduzir ou entender o problema."/></label>
        <footer><button className="ghost-button" type="button" onClick={()=>setComposerOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy==='create'}>{busy==='create'?'Abrindo…':'Abrir chamado'}</button></footer>
      </form></div>:null}
    </main>
  </>
}
