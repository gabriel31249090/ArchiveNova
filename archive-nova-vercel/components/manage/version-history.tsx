'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { useNovaConfirm } from '@/components/ui/nova-confirm'

type Version={id:string;chapter_id:string;chapter_number:number;chapter_title:string;version_number:number;word_count:number;status:string;created_at:string}

export function VersionHistory({workId}:{workId:string}){
  const supabase=useMemo(()=>createClient(),[])
  const {ask,dialog}=useNovaConfirm()
  const [items,setItems]=useState<Version[]>([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const load=useCallback(async()=>{const {data,error}=await supabase.rpc('chapter_version_history',{target_work:workId});if(error)setMessage(error.message);setItems((data||[]) as Version[]);setLoading(false)},[supabase,workId])
  useEffect(()=>{void load()},[load])
  async function restore(version:Version){
    const ok=await ask({title:'Restaurar esta versão?',description:'A versão atual será preservada no histórico antes da restauração.',confirmLabel:'Restaurar versão'})
    if(!ok)return
    const {error}=await supabase.rpc('restore_chapter_version',{target_version:version.id})
    if(error){setMessage(error.message);return}
    setMessage('Versão restaurada.');await load()
  }
  const grouped=items.reduce<Record<string,Version[]>>((acc,item)=>{(acc[item.chapter_id]||=[]).push(item);return acc},{})
  return <><NovaHeader title="Histórico de versões"/><main className="version-history-page"><header><div><p className="eyebrow">Versionamento</p><h1>Histórico de capítulos</h1><p>Cada alteração relevante cria um snapshot recuperável.</p></div><Link className="secondary-button" href={'/works/'+workId+'/manage'}>Voltar ao gerenciamento</Link></header>
  {loading?<div className="studio-loading"><span/><h2>Carregando versões…</h2></div>:Object.entries(grouped).map(([chapterId,list])=><section key={chapterId} className="version-chapter"><h2>Capítulo {list[0]?.chapter_number}: {list[0]?.chapter_title||'Sem título'}</h2><div>{list.map(v=><article key={v.id}><div><strong>v{v.version_number}</strong><span>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v.created_at))}</span></div><p>{v.word_count.toLocaleString('pt-BR')} palavras · {v.status}</p><button className="secondary-button" onClick={()=>void restore(v)}>Restaurar</button></article>)}</div></section>)}
  {message?<div className="reader-page-toast" role="status">{message}</div>:null}{dialog}</main></>
}
