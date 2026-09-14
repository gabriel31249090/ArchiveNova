'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { useNovaConfirm } from '@/components/ui/nova-confirm'
import type { WorkCardData } from '@/lib/types'

type Kind='series'|'collection'|'shelf'
type Info={id:string;title?:string;name?:string;summary?:string;description?:string|null;visibility:string;owner_id:string}
type Payload={series?:Info;collection?:Info;shelf?:Info;works?:Array<WorkCardData&{series_position?:number}>}

function parseWorkId(value:string){
  const trimmed=value.trim()
  return trimmed.match(/\/works\/([0-9a-f-]{36})/i)?.[1]||trimmed
}

function label(kind:Kind){return kind==='series'?'Série':kind==='collection'?'Coleção':'Estante'}

export function GroupManager({kind,id}:{kind:Kind;id:string}){
  const supabase=useMemo(()=>createClient(),[])
  const router=useRouter()
  const {ask,dialog}=useNovaConfirm()
  const [payload,setPayload]=useState<Payload|null>(null)
  const [name,setName]=useState('')
  const [description,setDescription]=useState('')
  const [visibility,setVisibility]=useState('PUBLIC')
  const [workInput,setWorkInput]=useState('')
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    setLoading(true)
    const rpc=kind==='series'?'get_series':kind==='collection'?'get_collection':'get_shelf'
    const args=kind==='series'?{target_series:id}:kind==='collection'?{target_collection:id}:{target_shelf:id}
    const {data,error}=await supabase.rpc(rpc,args)
    if(error||!data){setMessage('Não foi possível abrir este item.');setLoading(false);return}
    const p=data as Payload
    const info=(p.series||p.collection||p.shelf) as Info
    setPayload(p)
    setName(String(info.title||info.name||''))
    setDescription(String(info.summary||info.description||''))
    setVisibility(String(info.visibility||'PUBLIC'))
    setLoading(false)
  },[supabase,kind,id])

  useEffect(()=>{void load()},[load])

  async function save(){
    let error=null
    if(kind==='series')({error}=await supabase.rpc('update_series_info',{target_series:id,next_title:name,next_summary:description,next_visibility:visibility}))
    if(kind==='collection')({error}=await supabase.rpc('update_collection_info',{target_collection:id,next_name:name,next_description:description,next_visibility:visibility}))
    if(kind==='shelf')({error}=await supabase.rpc('update_shelf_info',{target_shelf:id,next_name:name,next_description:description,next_visibility:visibility}))
    setMessage(error?error.message:'Alterações salvas.')
    if(!error)await load()
  }

  async function setWork(value:string,include:boolean){
    const workId=parseWorkId(value)
    if(!/^[0-9a-f-]{36}$/i.test(workId)){setMessage('Cole o link ou UUID de uma obra.');return}
    let error=null
    if(kind==='series')({error}=await supabase.rpc('set_series_work',{target_series:id,target_work:workId,should_include:include}))
    if(kind==='collection')({error}=await supabase.rpc('set_collection_work',{target_collection:id,target_work:workId,should_include:include}))
    if(kind==='shelf')({error}=await supabase.rpc('set_shelf_work',{target_shelf:id,target_work:workId,should_include:include}))
    if(error){setMessage(error.message);return}
    setWorkInput('');await load()
  }

  async function move(index:number,direction:-1|1){
    if(kind==='collection'||!payload?.works)return
    const next=[...payload.works]
    const target=index+direction
    if(target<0||target>=next.length)return
    ;[next[index],next[target]]=[next[target],next[index]]
    const ids=next.map(work=>work.id)
    const {error}=kind==='series'
      ? await supabase.rpc('reorder_series_works',{target_series:id,ordered_work_ids:ids})
      : await supabase.rpc('reorder_shelf_works',{target_shelf:id,ordered_work_ids:ids})
    if(error){setMessage(error.message);return}
    setPayload({...payload,works:next})
  }

  async function remove(){
    const ok=await ask({title:'Excluir '+label(kind).toLowerCase()+'?',description:'As obras não serão excluídas. Apenas este agrupamento será removido.',confirmLabel:'Excluir',tone:'danger'})
    if(!ok)return
    const rpc=kind==='series'?'delete_series':kind==='collection'?'delete_collection':'delete_shelf'
    const args=kind==='series'?{target_series:id}:kind==='collection'?{target_collection:id}:{target_shelf:id}
    const {error}=await supabase.rpc(rpc,args)
    if(error){setMessage(error.message);return}
    router.push('/dashboard/library')
  }

  if(loading)return <><NovaHeader title="Organização"/><main className="group-manager-page"><div className="studio-loading"><span/><h1>Carregando…</h1></div></main></>
  if(!payload)return <><NovaHeader title="Organização"/><main className="group-manager-page"><section className="library-empty"><h1>{message||'Item não encontrado.'}</h1><Link className="primary-button" href="/dashboard/library">Voltar</Link></section></main></>

  const works=payload.works||[]
  const publicKind=kind==='collection'?'collections':kind==='shelf'?'shelves':'series'
  return <><NovaHeader title={'Gerenciar '+label(kind)}/><main className="group-manager-page">
    <header className="group-manager-hero"><div><p className="eyebrow">Library Studio</p><h1>{name||label(kind)}</h1><p>{kind==='series'?'Defina a ordem exata das partes e mantenha a série organizada.':'Edite os detalhes e controle quais obras fazem parte deste agrupamento.'}</p></div><div><Link className="secondary-button" href={'/'+publicKind+'/'+id}>Ver página pública</Link><Link className="secondary-button" href="/dashboard/library">Voltar</Link></div></header>
    <section className="group-manager-form">
      <label>Nome<input value={name} onChange={e=>setName(e.target.value)} maxLength={kind==='series'?300:160}/></label>
      <label>Visibilidade<select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="PUBLIC">Pública</option><option value="UNLISTED">Não listada</option><option value="PRIVATE">Privada</option></select></label>
      <label className="wide">Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4}/></label>
      <div className="group-manager-form-actions"><button className="primary-button" onClick={()=>void save()}>Salvar alterações</button><button className="danger-button" onClick={()=>void remove()}>Excluir {label(kind).toLowerCase()}</button></div>
    </section>
    <section className="group-manager-works">
      <header><div><p className="eyebrow">Obras</p><h2>{works.length} {works.length===1?'item':'itens'}</h2></div><div className="library-attach"><input value={workInput} onChange={e=>setWorkInput(e.target.value)} placeholder="Link ou UUID da obra"/><button onClick={()=>void setWork(workInput,true)}>Adicionar</button></div></header>
      <div>{works.map((work,index)=><article key={work.id}><div className="group-work-position">{String(index+1).padStart(2,'0')}</div><div><strong><Link href={'/works/'+work.id}>{work.title}</Link></strong><p>@{work.author_username} · {work.chapter_count} cap. · {work.word_count.toLocaleString('pt-BR')} palavras</p></div><div className="group-work-actions">{kind!=='collection'?<><button disabled={index===0} onClick={()=>void move(index,-1)}>↑</button><button disabled={index===works.length-1} onClick={()=>void move(index,1)}>↓</button></>:null}<button className="danger-text" onClick={()=>void setWork(work.id,false)}>Remover</button></div></article>)}</div>
    </section>
    {message?<div className="reader-page-toast" role="status">{message}</div>:null}{dialog}
  </main></>
}
