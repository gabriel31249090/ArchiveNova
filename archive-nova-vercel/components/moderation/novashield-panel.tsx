'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaIcon } from '@/components/ui/nova-icon'
import { useNovaConfirm } from '@/components/ui/nova-confirm'

type PendingItem={
  id:string;title:string;rating:string;status:string;visibility:string;updated_at:string;
  author_username:string;moderation_scan_pending:boolean;moderation_risk_score:number;
  moderation_state:string;last_moderation_scan_at:string|null
}
type Signal={category:string;label:string;weight:number;matches:number}
type FlaggedItem={
  scan_id:string;work_id:string;score:number;severity:'WATCH'|'REVIEW'|'URGENT'|'CLEAR';
  recommended_action:string;review_status:string;created_at:string;title:string;
  author_username:string;signals:Signal[]
}
type QueuePayload={pending?:PendingItem[];flagged?:FlaggedItem[]}

const CATEGORY_LABEL:Record<string,string>={
  CHILD_SAFETY:'Segurança infantil',TERRORISM:'Terrorismo / extremismo',
  HATE:'Ódio / desumanização',SELF_HARM:'Autoagressão',DOXXING:'Dados pessoais',
  RATING_MISMATCH:'Classificação etária',OTHER:'Outro',
}

function dt(value:string|null){
  if(!value)return'Nunca'
  return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))
}

export function NovaShieldPanel(){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const {ask,dialog}=useNovaConfirm()
  const [queue,setQueue]=useState<QueuePayload>({})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const [tab,setTab]=useState<'flagged'|'pending'>('flagged')

  async function load(){
    if(!supabase)return
    setError('')
    const {data,error:rpcError}=await supabase.rpc('novashield_staff_queue',{limit_count:100})
    if(rpcError){setError('Não foi possível carregar a fila do NovaShield.');setLoading(false);return}
    setQueue((data||{}) as QueuePayload)
    setLoading(false)
  }

  useEffect(()=>{void load()},[supabase])

  function flash(value:string){
    setMessage(value)
    window.setTimeout(()=>setMessage(current=>current===value?'':current),2800)
  }

  async function scanWork(work:PendingItem){
    if(!supabase)return
    setBusy('scan-'+work.id)
    const {data,error:rpcError}=await supabase.rpc('novashield_scan_work',{target_work:work.id,scan_source:'STAFF_MANUAL'})
    setBusy('')
    if(rpcError){flash('O scan manual falhou.');return}
    const result=(data||{}) as {score?:number;severity?:string}
    flash('Scan concluído · risco '+String(result.score||0)+'/100 · '+String(result.severity||'CLEAR'))
    await load()
  }

  async function review(item:FlaggedItem,status:'FALSE_POSITIVE'|'CONFIRMED_SAFE'|'ACTION_REQUIRED'){
    if(!supabase)return
    const title=status==='ACTION_REQUIRED'?'Confirmar necessidade de ação?':status==='FALSE_POSITIVE'?'Marcar como falso positivo?':'Confirmar como seguro?'
    const description=status==='ACTION_REQUIRED'
      ?'O alerta continuará associado à obra e a denúncia interna permanecerá disponível para ação da equipe.'
      :'O risco ativo da obra será limpo e a denúncia automática do NovaShield será encerrada.'
    if(!(await ask({title,description,confirmLabel:status==='ACTION_REQUIRED'?'Manter para ação':'Concluir revisão',tone:status==='ACTION_REQUIRED'?'danger':'default'})))return
    setBusy('review-'+item.scan_id)
    const {error:rpcError}=await supabase.rpc('novashield_review_scan',{target_scan:item.scan_id,next_review_status:status,moderator_note:'Revisão pelo painel NovaShield'})
    setBusy('')
    if(rpcError){flash('Não foi possível registrar a revisão.');return}
    flash('Revisão registrada.')
    await load()
  }

  async function hideWork(item:FlaggedItem){
    if(!supabase)return
    if(!(await ask({title:'Ocultar obra sinalizada?',description:'A obra sai da área pública, mas permanece disponível ao autor e à equipe para revisão.',confirmLabel:'Ocultar obra',tone:'danger'})))return
    setBusy('hide-'+item.work_id)
    const {error:rpcError}=await supabase.rpc('moderate_work',{target_work:item.work_id,hide:true})
    setBusy('')
    if(rpcError){flash('Não foi possível ocultar a obra.');return}
    flash('Obra retirada do público.')
  }

  const flagged=queue.flagged||[]
  const pending=queue.pending||[]
  const urgent=flagged.filter(item=>item.severity==='URGENT').length
  const reviewCount=flagged.filter(item=>item.severity==='REVIEW').length

  return <section className="novashield-panel">
    <header className="novashield-head">
      <div>
        <div className="novashield-kicker"><span className="novashield-orb">✦</span><strong>NovaShield</strong><b>PSEUDO-IA EXPLICÁVEL</b></div>
        <h2>Triagem assistida de risco</h2>
        <p>Regras contextuais priorizam conteúdo suspeito. Nenhuma obra é punida automaticamente: toda ação continua dependendo da equipe.</p>
      </div>
      <button className="secondary-button" disabled={loading} onClick={()=>{setLoading(true);void load()}}><NovaIcon name="history" size={16}/> Atualizar</button>
    </header>

    <div className="novashield-metrics">
      <div><span className="risk-dot urgent"/><strong>{urgent}</strong><small>urgentes</small></div>
      <div><span className="risk-dot review"/><strong>{reviewCount}</strong><small>revisar</small></div>
      <div><span className="risk-dot pending"/><strong>{pending.length}</strong><small>aguardando scan</small></div>
      <div><span className="risk-dot safe"/><strong>Humano</strong><small>decisão final</small></div>
    </div>

    {error?<div className="studio-alert error">{error}</div>:null}
    {message?<div className="studio-alert success">{message}</div>:null}

    <div className="novashield-tabs">
      <button className={tab==='flagged'?'active':''} onClick={()=>setTab('flagged')}>Sinalizadas <b>{flagged.length}</b></button>
      <button className={tab==='pending'?'active':''} onClick={()=>setTab('pending')}>Pendentes <b>{pending.length}</b></button>
    </div>

    {loading?<div className="novashield-loading"><span/><p>Lendo sinais de risco…</p></div>:null}

    {!loading&&tab==='flagged'&&flagged.length?<div className="novashield-grid">{flagged.map(item=><article className={'novashield-card '+item.severity.toLowerCase()} key={item.scan_id}>
      <header><div><span className={'risk-pill '+item.severity.toLowerCase()}>{item.severity}</span><strong>{item.score}/100</strong></div><small>{dt(item.created_at)}</small></header>
      <div className="novashield-target"><p className="eyebrow">Obra sinalizada</p><Link href={'/works/'+item.work_id}><h3>{item.title}</h3></Link><span>@{item.author_username}</span></div>
      <div className="novashield-signals">
        {item.signals.map((signal,index)=><div key={signal.category+'-'+index}><span>{CATEGORY_LABEL[signal.category]||signal.category}</span><strong>{signal.weight} pts</strong><p>{signal.label}{signal.matches>1?' · '+signal.matches+' ocorrências':''}</p></div>)}
      </div>
      <footer>
        <div><Link className="ghost-button" href={'/works/'+item.work_id}>Abrir obra</Link><button className="danger-button" disabled={busy.includes(item.work_id)} onClick={()=>void hideWork(item)}>Ocultar</button></div>
        <div><button className="ghost-button" disabled={busy.includes(item.scan_id)} onClick={()=>void review(item,'FALSE_POSITIVE')}>Falso positivo</button><button className="secondary-button" disabled={busy.includes(item.scan_id)} onClick={()=>void review(item,'CONFIRMED_SAFE')}>Seguro</button><button className="primary-button" disabled={busy.includes(item.scan_id)} onClick={()=>void review(item,'ACTION_REQUIRED')}>Exige ação</button></div>
      </footer>
    </article>)}</div>:null}

    {!loading&&tab==='flagged'&&!flagged.length?<div className="studio-empty moderation-empty"><span><NovaIcon name="check" size={28}/></span><h3>Nenhum risco ativo</h3><p>O NovaShield não tem obras sinalizadas neste momento.</p></div>:null}

    {!loading&&tab==='pending'&&pending.length?<div className="novashield-pending-list">{pending.map(item=><article key={item.id}><div><span className="pending-pulse"/><div><strong>{item.title}</strong><small>@{item.author_username} · atualizado {dt(item.updated_at)}</small></div></div><button className="secondary-button" disabled={busy==='scan-'+item.id} onClick={()=>void scanWork(item)}>{busy==='scan-'+item.id?'Escaneando…':'Escanear agora'}</button></article>)}</div>:null}

    {!loading&&tab==='pending'&&!pending.length?<div className="studio-empty moderation-empty"><span>✦</span><h3>Fila automática em dia</h3><p>Novas obras e alterações serão processadas em pequenos lotes pelo NovaShield.</p></div>:null}
    {dialog}
  </section>
}
