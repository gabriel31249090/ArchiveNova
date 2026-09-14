'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { WorkCardData } from '@/lib/types'

type Kind='FANDOM'|'TAG'|'CHARACTER'|'RELATIONSHIP'
type Payload={taxonomy?:{id:string;name:string;slug:string;description:string|null;kind:string};works?:WorkCardData[]}

export function TaxonomyPage({slug,kind}:{slug:string;kind:Kind}){
  const supabase=useMemo(()=>createClient(),[])
  const [payload,setPayload]=useState<Payload|null>(null)
  const [loading,setLoading]=useState(true)
  const load=useCallback(async()=>{
    const {data}=await supabase.rpc('get_taxonomy_page',{target_slug:decodeURIComponent(slug),target_kind:kind})
    setPayload((data||null) as Payload|null);setLoading(false)
  },[supabase,slug,kind])
  useEffect(()=>{void load()},[load])
  if(loading)return <><NovaHeader/><main className="taxonomy-public-page"><div className="studio-loading"><span/><h1>Carregando índice…</h1></div></main></>
  if(!payload?.taxonomy)return <><NovaHeader/><main className="taxonomy-public-page"><section className="library-empty"><h1>Índice não encontrado.</h1><Link className="primary-button" href="/explore">Explorar</Link></section></main></>
  const works=payload.works||[]
  const label=kind==='FANDOM'?'Fandom':kind==='CHARACTER'?'Personagem':kind==='RELATIONSHIP'?'Relacionamento':'Tag'
  return <>
    <NovaHeader/>
    <main className="taxonomy-public-page">
      <header className="taxonomy-public-hero"><p className="eyebrow">{label}</p><h1>{payload.taxonomy.name}</h1><p>{payload.taxonomy.description||'Índice comunitário do Archive Nova.'}</p><span>{works.length} {works.length===1?'obra':'obras'}</span></header>
      <section className="taxonomy-work-grid">{works.map(work=><article key={work.id}><div><span className="rating-badge">{work.rating==='GENERAL'?'G':work.rating==='TEEN'?'T':work.rating==='MATURE'?'M':work.rating==='EXPLICIT'?'E':'?'}</span></div><div><h2><Link href={'/works/'+work.id}>{work.title}</Link></h2><p>por <Link href={'/users/'+encodeURIComponent(work.author_username)}>@{work.author_username}</Link></p><p>{work.summary||'Sem resumo.'}</p><footer><span>{work.chapter_count} cap.</span><span>{work.word_count.toLocaleString('pt-BR')} palavras</span><span>{work.kudos_count.toLocaleString('pt-BR')} kudos</span></footer></div></article>)}</section>
    </main>
  </>
}
