'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'
import { WorkCard } from '@/components/work-card'
import { normalizeWorkCard } from '@/lib/work-normalize'
import { compactNumber, fullNumber } from '@/lib/format'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import type { WorkCardData } from '@/lib/types'

type Kind='FANDOM'|'TAG'|'CHARACTER'|'RELATIONSHIP'
type Related={id:string;name:string;slug:string;type?:string;work_count:number}
type Author={id:string;username:string;display_name:string;avatar_url?:string|null;work_count:number}
type Stats={works?:number;words?:number;kudos?:number;authors?:number}
type Payload={
  taxonomy?:{id:string;name:string;slug:string;description:string|null;kind:string}
  stats?:Stats
  works?:Array<Record<string,unknown>>
  related?:Related[]
  authors?:Author[]
  fandoms?:Related[]
}

function pathForTaxonomy(item:Related){
  if(item.type==='CHARACTER')return '/characters/'+encodeURIComponent(item.slug)
  if(item.type==='RELATIONSHIP')return '/relationships/'+encodeURIComponent(item.slug)
  return '/tags/'+encodeURIComponent(item.slug)
}

export function TaxonomyPage({slug,kind}:{slug:string;kind:Kind}){
  const supabase=useMemo(()=>createClient(),[])
  const [payload,setPayload]=useState<Payload|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [layout,setLayout]=useState<'grid'|'list'>('grid')
  const { flags }=useFeatureFlags()
  const hubsEnabled=flags.fandom_hubs!==false

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data,error:rpcError}=await supabase.rpc('get_taxonomy_page',{target_slug:decodeURIComponent(slug),target_kind:kind})
    if(rpcError){console.error(rpcError);setPayload(null);setError('Este índice não existe ou ainda não tem conteúdo público.');setLoading(false);return}
    setPayload((data||null) as Payload)
    setLoading(false)
  },[supabase,slug,kind])

  useEffect(()=>{void load()},[load])

  if(loading)return <><NovaHeader/><main className="taxonomy-public-page"><div className="studio-loading"><span/><h1>Montando o hub…</h1></div></main></>
  if(!payload?.taxonomy)return <><NovaHeader/><main className="taxonomy-public-page"><section className="library-empty"><h1>{error||'Índice não encontrado.'}</h1><Link className="primary-button" href="/explore">Explorar</Link></section></main></>

  const works=(payload.works||[]).map(normalizeWorkCard)
  const label=kind==='FANDOM'?'Fandom':kind==='CHARACTER'?'Personagem':kind==='RELATIONSHIP'?'Relacionamento':'Tag'
  const stats=payload.stats||{}
  const related=payload.related||[]
  const fandoms=payload.fandoms||[]
  const authors=payload.authors||[]

  function openWork(id:string){window.location.href='/works/'+id}
  async function bookmark(work:WorkCardData){
    const user=(await supabase.auth.getUser()).data.user
    if(!user){window.location.href='/explore?auth=login&return='+encodeURIComponent(window.location.pathname);return}
    await supabase.rpc('toggle_bookmark',{target_work:work.id})
    await load()
  }

  return <>
    <NovaHeader/>
    <main className="taxonomy-public-page taxonomy-hub-v47">
      <header className="taxonomy-public-hero taxonomy-hub-hero-v47">
        <div><p className="eyebrow">{label} Hub</p><h1>{payload.taxonomy.name}</h1><p>{payload.taxonomy.description||'Índice comunitário do Archive Nova, construído a partir das histórias publicadas.'}</p></div>
        {hubsEnabled?<div className="taxonomy-hub-stats-v47">
          <div><strong>{fullNumber(stats.works??works.length)}</strong><span>obras</span></div>
          <div><strong>{compactNumber(stats.words||0)}</strong><span>palavras</span></div>
          <div><strong>{compactNumber(stats.kudos||0)}</strong><span>kudos</span></div>
          {stats.authors!=null?<div><strong>{fullNumber(stats.authors)}</strong><span>autores</span></div>:null}
        </div>:null}
      </header>

      {hubsEnabled&&related.length?<section className="taxonomy-hub-strip-v47"><header><p className="eyebrow">Conexões</p><h2>Tags relacionadas</h2></header><div>{related.map(item=><Link key={item.id} href={pathForTaxonomy(item)}><strong>{item.name}</strong><small>{item.work_count} obras</small></Link>)}</div></section>:null}

      {hubsEnabled&&fandoms.length?<section className="taxonomy-hub-strip-v47"><header><p className="eyebrow">Universos relacionados</p><h2>Fandoms onde aparece</h2></header><div>{fandoms.map(item=><Link key={item.id} href={'/fandoms/'+encodeURIComponent(item.slug)}><strong>{item.name}</strong><small>{item.work_count} obras</small></Link>)}</div></section>:null}

      {hubsEnabled&&authors.length?<section className="taxonomy-authors-v47"><header><p className="eyebrow">Criadores</p><h2>Autores recentes neste fandom</h2></header><div>{authors.map(author=><Link href={'/users/'+encodeURIComponent(author.username)} key={author.id}>{author.avatar_url?<img src={author.avatar_url} alt=""/>:<span>{author.display_name.slice(0,1).toUpperCase()}</span>}<div><strong>{author.display_name}</strong><small>@{author.username} · {author.work_count} obras</small></div><NovaIcon name="arrowRight" size={15}/></Link>)}</div></section>:null}

      <section className="taxonomy-hub-works-v47">
        <header><div><p className="eyebrow">Histórias</p><h2>{works.length} {works.length===1?'obra publicada':'obras publicadas'}</h2></div><div className="segmented"><button className={layout==='grid'?'active':''} onClick={()=>setLayout('grid')} aria-label="Grade"><NovaIcon name="grid" size={17}/></button><button className={layout==='list'?'active':''} onClick={()=>setLayout('list')} aria-label="Lista"><NovaIcon name="list" size={17}/></button></div></header>
        {works.length?<div className={'work-grid '+(layout==='list'?'list':'')}>{works.map(work=><WorkCard key={work.id} work={work} onOpen={openWork} onBookmark={item=>void bookmark(item)}/>)}</div>:<section className="studio-empty large"><span>✦</span><h2>Nenhuma obra pública ainda</h2><p>Quando novas histórias usarem este índice, elas aparecerão aqui.</p></section>}
      </section>
    </main>
  </>
}
