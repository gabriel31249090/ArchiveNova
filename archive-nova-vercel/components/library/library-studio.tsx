'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { WorkCardData } from '@/lib/types'

type SeriesItem={id:string;title:string;summary:string;visibility:string;count:number;updated_at:string}
type CollectionItem={id:string;name:string;slug:string;description:string|null;visibility:string;count:number;updated_at:string}
type ShelfItem={id:string;name:string;slug:string;description:string|null;visibility:string;count:number;updated_at:string}

function extractWorkId(value:string){
  const trimmed=value.trim()
  const match=trimmed.match(/\/works\/([0-9a-f-]{36})/i)
  return match?.[1] || trimmed
}

export function LibraryStudio(){
  const supabase=useMemo(()=>createClient(),[])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [series,setSeries]=useState<SeriesItem[]>([])
  const [collections,setCollections]=useState<CollectionItem[]>([])
  const [shelves,setShelves]=useState<ShelfItem[]>([])
  const [works,setWorks]=useState<WorkCardData[]>([])

  const load=useCallback(async()=>{
    setLoading(true)
    const user=(await supabase.auth.getUser()).data.user
    if(!user){setLoading(false);return}
    const [groups,library,ownWorks]=await Promise.all([
      supabase.rpc('my_series_and_collections'),
      supabase.rpc('my_library'),
      supabase.from('public_work_cards').select('*').eq('creator_id',user.id).order('updated_at',{ascending:false}),
    ])
    const gp=(groups.data||{}) as {series?:SeriesItem[];collections?:CollectionItem[]}
    const lp=(library.data||{}) as {shelves?:ShelfItem[]}
    setSeries(gp.series||[])
    setCollections(gp.collections||[])
    setShelves(lp.shelves||[])
    setWorks((ownWorks.data||[]) as unknown as WorkCardData[])
    setLoading(false)
  },[supabase])

  useEffect(()=>{void load()},[load])

  async function createGroup(event:FormEvent<HTMLFormElement>,kind:'SERIES'|'COLLECTION'|'SHELF'){
    event.preventDefault()
    const form=event.currentTarget
    const fd=new FormData(form)
    const name=String(fd.get('name')||'').trim()
    const description=String(fd.get('description')||'').trim()
    const visibility=String(fd.get('visibility')||'PUBLIC')
    if(!name)return
    let error=null
    if(kind==='SERIES')({error}=await supabase.rpc('create_series',{series_title:name,series_summary:description,series_visibility:visibility}))
    if(kind==='COLLECTION')({error}=await supabase.rpc('create_collection',{collection_name:name,collection_description:description||null,collection_visibility:visibility}))
    if(kind==='SHELF')({error}=await supabase.rpc('create_shelf',{shelf_name:name,shelf_description:description||null,shelf_visibility:visibility}))
    if(error){setMessage(error.message);return}
    form.reset();setMessage('Criado com sucesso.');await load()
  }

  async function attach(kind:'SERIES'|'COLLECTION'|'SHELF',containerId:string,value:string,include=true){
    const workId=extractWorkId(value)
    if(!/^[0-9a-f-]{36}$/i.test(workId)){setMessage('Cole o link da obra ou o UUID dela.');return}
    let error=null
    if(kind==='SERIES')({error}=await supabase.rpc('set_series_work',{target_series:containerId,target_work:workId,should_include:include}))
    if(kind==='COLLECTION')({error}=await supabase.rpc('set_collection_work',{target_collection:containerId,target_work:workId,should_include:include}))
    if(kind==='SHELF')({error}=await supabase.rpc('set_shelf_work',{target_shelf:containerId,target_work:workId,should_include:include}))
    if(error){setMessage(error.message);return}
    setMessage(include?'Obra adicionada.':'Obra removida.');await load()
  }

  if(loading)return <><NovaHeader title="Organização" /><main className="library-studio-page"><div className="studio-loading"><span/><h1>Organizando o arquivo…</h1></div></main></>

  return <>
    <NovaHeader title="Organização" />
    <main className="library-studio-page">
      <header className="library-studio-hero"><div><p className="eyebrow">Library & Studio</p><h1>Séries, coleções e estantes.</h1><p>Séries organizam suas próprias obras. Coleções e estantes podem reunir qualquer história pública do Archive Nova.</p></div><Link className="secondary-button" href="/library">Ver minha biblioteca</Link></header>

      <section className="library-studio-create-grid">
        {([
          ['SERIES','Nova série','Ex.: Crônicas do Norte'],
          ['COLLECTION','Nova coleção','Ex.: Antologia de setembro'],
          ['SHELF','Nova estante','Ex.: Slow burns que me destruíram'],
        ] as const).map(([kind,title,placeholder])=><form key={kind} className="library-create-card" onSubmit={e=>void createGroup(e,kind)}>
          <span>{kind==='SERIES'?'01':kind==='COLLECTION'?'02':'03'}</span><h2>{title}</h2>
          <input name="name" maxLength={kind==='SERIES'?300:160} placeholder={placeholder} required/>
          <textarea name="description" rows={3} placeholder="Descrição opcional"/>
          <select name="visibility"><option value="PUBLIC">Pública</option><option value="UNLISTED">Não listada</option><option value="PRIVATE">Privada</option></select>
          <button className="primary-button">Criar</button>
        </form>)}
      </section>

      <section className="library-studio-section"><header><div><p className="eyebrow">Séries</p><h2>Suas narrativas em sequência</h2></div><span>{series.length}</span></header>
        <div className="library-manage-list">{series.map(item=><article key={item.id}><div><strong>{item.title}</strong><p>{item.summary||'Sem descrição.'}</p><small>{item.count} obra(s) · {item.visibility}</small></div><div className="library-manage-actions"><select defaultValue="" onChange={e=>{if(e.target.value){void attach('SERIES',item.id,e.target.value);e.currentTarget.value=''}}}><option value="">Adicionar uma obra sua…</option>{works.map(work=><option key={work.id} value={work.id}>{work.title}</option>)}</select><Link href={'/dashboard/library/series/'+item.id}>Gerenciar</Link><Link href={'/series/'+item.id}>Página pública</Link></div></article>)}</div>
      </section>

      <section className="library-studio-section"><header><div><p className="eyebrow">Coleções</p><h2>Curadorias maiores</h2></div><span>{collections.length}</span></header>
        <div className="library-manage-list">{collections.map(item=><AttachCard key={item.id} title={item.name} description={item.description||''} count={item.count} href={'/collections/'+item.id} manageHref={'/dashboard/library/collections/'+item.id} onAttach={value=>attach('COLLECTION',item.id,value)}/>)}</div>
      </section>

      <section className="library-studio-section"><header><div><p className="eyebrow">Estantes</p><h2>Listas pessoais compartilháveis</h2></div><span>{shelves.length}</span></header>
        <div className="library-manage-list">{shelves.map(item=><AttachCard key={item.id} title={item.name} description={item.description||''} count={item.count} href={'/shelves/'+item.id} manageHref={'/dashboard/library/shelves/'+item.id} onAttach={value=>attach('SHELF',item.id,value)}/>)}</div>
      </section>
      {message?<div className="reader-page-toast" role="status">{message}</div>:null}
    </main>
  </>
}

function AttachCard({title,description,count,href,manageHref,onAttach}:{title:string;description:string;count:number;href:string;manageHref:string;onAttach:(value:string)=>void}){
  const [value,setValue]=useState('')
  return <article><div><strong>{title}</strong><p>{description||'Sem descrição.'}</p><small>{count} obra(s)</small></div><div className="library-manage-actions"><div className="library-attach"><input value={value} onChange={e=>setValue(e.target.value)} placeholder="Cole link ou UUID da obra"/><button onClick={()=>{if(value.trim()){onAttach(value);setValue('')}}}>Adicionar</button></div><Link href={manageHref}>Gerenciar</Link><Link href={href}>Página pública</Link></div></article>
}
