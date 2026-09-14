'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { WorkCardData } from '@/lib/types'

type Kind='series'|'collection'|'shelf'
type Payload={
  series?:Record<string,unknown>;collection?:Record<string,unknown>;shelf?:Record<string,unknown>;
  works?:Array<WorkCardData&{series_position?:number}>
}

export function PublicListPage({kind,id}:{kind:Kind;id:string}){
  const supabase=useMemo(()=>createClient(),[])
  const [payload,setPayload]=useState<Payload|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const rpc=kind==='series'?'get_series':kind==='collection'?'get_collection':'get_shelf'
    const arg=kind==='series'?{target_series:id}:kind==='collection'?{target_collection:id}:{target_shelf:id}
    const {data,error}=await supabase.rpc(rpc,arg)
    if(error||!data){setError('Esta lista não existe ou não está disponível.');setLoading(false);return}
    setPayload(data as Payload);setLoading(false)
  },[supabase,kind,id])
  useEffect(()=>{void load()},[load])

  if(loading)return <><NovaHeader/><main className="public-list-page"><div className="studio-loading"><span/><h1>Abrindo…</h1></div></main></>
  if(error||!payload)return <><NovaHeader/><main className="public-list-page"><section className="library-empty"><span>☾</span><h1>{error}</h1><Link className="primary-button" href="/explore">Explorar</Link></section></main></>

  const info=(payload.series||payload.collection||payload.shelf||{}) as Record<string,unknown>
  const title=String(info.title||info.name||'Lista')
  const description=String(info.summary||info.description||'')
  const owner=String(info.owner_display_name||info.owner_username||'')
  const ownerUsername=String(info.owner_username||'')
  const works=payload.works||[]

  return <>
    <NovaHeader/>
    <main className="public-list-page">
      <header className="public-list-hero">
        <p className="eyebrow">{kind==='series'?'Série':kind==='collection'?'Coleção':'Estante'}</p>
        <h1>{title}</h1>
        {owner?<p>por <Link href={'/users/'+encodeURIComponent(ownerUsername)}>{owner}</Link></p>:null}
        {description?<div>{description}</div>:null}
        <span>{works.length} {works.length===1?'obra':'obras'}</span>
      </header>
      <section className="public-list-grid">
        {works.map((work,index)=><article key={work.id}>
          <div className="public-list-index">{String((work.series_position||index+1)).padStart(2,'0')}</div>
          <div><p className="eyebrow">{work.fandoms?.[0]||'História'}</p><h2><Link href={'/works/'+work.id}>{work.title}</Link></h2><p>{work.summary||'Sem resumo.'}</p><small>{work.chapter_count} cap. · {work.word_count.toLocaleString('pt-BR')} palavras · {work.kudos_count.toLocaleString('pt-BR')} kudos</small></div>
        </article>)}
      </section>
    </main>
  </>
}
