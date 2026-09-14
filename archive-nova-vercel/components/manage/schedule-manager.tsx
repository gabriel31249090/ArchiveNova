'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'

type Chapter={id:string;chapter_number:number;title:string|null;status:string;scheduled_for?:string|null;published_at?:string|null}

export function ScheduleManager({workId}:{workId:string}){
  const supabase=useMemo(()=>createClient(),[])
  const [chapters,setChapters]=useState<Chapter[]>([])
  const [dateById,setDateById]=useState<Record<string,string>>({})
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const load=useCallback(async()=>{const {data,error}=await supabase.from('chapters').select('id,chapter_number,title,status,scheduled_for,published_at').eq('work_id',workId).order('chapter_number');if(error)setMessage(error.message);setChapters((data||[]) as Chapter[]);setLoading(false)},[supabase,workId])
  useEffect(()=>{void load()},[load])
  async function schedule(chapter:Chapter){
    const value=dateById[chapter.id]
    if(!value){setMessage('Escolha uma data e horário.');return}
    const iso=new Date(value).toISOString()
    const {error}=await supabase.rpc('schedule_chapter',{target_chapter:chapter.id,publish_at:iso})
    if(error){setMessage(error.message);return}
    setMessage('Publicação agendada.');await load()
  }
  return <><NovaHeader title="Agendamento"/><main className="schedule-page"><header><div><p className="eyebrow">Publicação automática</p><h1>Agendar capítulos</h1><p>Capítulos agendados são publicados automaticamente quando o horário chegar.</p></div><Link className="secondary-button" href={'/works/'+workId+'/manage'}>Gerenciar obra</Link></header>
  {loading?<div className="studio-loading"><span/><h2>Carregando…</h2></div>:<section className="schedule-list">{chapters.map(ch=><article key={ch.id}><div><strong>{String(ch.chapter_number).padStart(2,'0')} · {ch.title||'Sem título'}</strong><span className={'schedule-status '+ch.status.toLowerCase()}>{ch.status}</span>{ch.scheduled_for?<small>Agendado para {new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(ch.scheduled_for))}</small>:null}</div><div><input type="datetime-local" min={new Date(Date.now()+60000).toISOString().slice(0,16)} value={dateById[ch.id]||''} onChange={e=>setDateById(cur=>({...cur,[ch.id]:e.target.value}))}/><button className="primary-button" onClick={()=>void schedule(ch)}>Agendar</button></div></article>)}</section>}
  {message?<div className="reader-page-toast" role="status">{message}</div>:null}</main></>
}
