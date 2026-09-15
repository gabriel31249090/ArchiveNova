'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WorkspaceShell } from '@/components/shared/workspace-shell'
import { WorkCard } from '@/components/work-card'
import { NovaIcon } from '@/components/ui/nova-icon'
import { normalizeWorkCard } from '@/lib/work-normalize'
import { compactNumber, fullNumber } from '@/lib/format'
import type { FandomStat, PlatformStats, WorkCardData } from '@/lib/types'

type Recommendation={work:WorkCardData;reason:string;reason_code?:string}
type ContinueWork=WorkCardData&{last_chapter_id?:string|null;progress?:number;last_read_at?:string}
type HomePayload={
  viewer?:{authenticated?:boolean;library_count?:number;unread_notifications?:number}
  stats?:PlatformStats
  continue_reading?:Array<Record<string,unknown>>
  recommended?:Array<Record<string,unknown>>
  following?:Array<Record<string,unknown>>
  recent?:Array<Record<string,unknown>>
  fandoms?:FandomStat[]
}

const EMPTY_STATS:PlatformStats={works:0,fandoms:0,users:0,words:0}

function normalizeRecommendations(rows:Array<Record<string,unknown>>|undefined):Recommendation[]{
  return (rows||[]).map(row=>({
    work:normalizeWorkCard((row.work||{}) as Record<string,unknown>),
    reason:String(row.reason||'Do arquivo para você'),
    reason_code:row.reason_code?String(row.reason_code):undefined,
  }))
}

export function PersonalizedHome(){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const [payload,setPayload]=useState<HomePayload>({})
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=useCallback(async()=>{
    if(!supabase){setError('Supabase não configurado.');setLoading(false);return}
    setLoading(true);setError('')
    const {data,error:homeError}=await supabase.rpc('personalized_home',{limit_count:8})
    if(homeError){console.error(homeError);setError('Não foi possível montar sua página inicial.');setLoading(false);return}
    setPayload((data||{}) as HomePayload)
    setLoading(false)
  },[supabase])

  useEffect(()=>{void load()},[load])

  const stats=payload.stats||EMPTY_STATS
  const fandoms=(payload.fandoms||[]).map(row=>({
    id:String(row.id),name:String(row.name),slug:String(row.slug),
    work_count:Number(row.work_count||0),total_words:Number(row.total_words||0),
  }))
  const continueReading=(payload.continue_reading||[]).map(row=>Object.assign(normalizeWorkCard(row),{
    last_chapter_id:row.last_chapter_id?String(row.last_chapter_id):null,
    progress:Number(row.progress||0),
    last_read_at:row.last_read_at?String(row.last_read_at):undefined,
  })) as ContinueWork[]
  const recommended=normalizeRecommendations(payload.recommended)
  const following=normalizeRecommendations(payload.following)
  const recent=normalizeRecommendations(payload.recent)

  async function toggleBookmark(work:WorkCardData){
    if(!supabase)return
    const user=(await supabase.auth.getUser()).data.user
    if(!user){window.location.href='/explore?auth=login&return=%2Fhome';return}
    const {data,error:bookmarkError}=await supabase.rpc('toggle_bookmark',{target_work:work.id})
    if(bookmarkError){setError('Não foi possível atualizar o bookmark.');return}
    const bookmarked=Boolean(data)
    const patch=(items:Recommendation[])=>items.map(item=>item.work.id===work.id?{
      ...item,work:{...item.work,bookmarked,bookmarks_count:Math.max(0,item.work.bookmarks_count+(bookmarked?1:-1))}
    }:item)
    setPayload(current=>({
      ...current,
      recommended:patch(normalizeRecommendations(current.recommended)).map(item=>({work:item.work,reason:item.reason,reason_code:item.reason_code})),
      following:patch(normalizeRecommendations(current.following)).map(item=>({work:item.work,reason:item.reason,reason_code:item.reason_code})),
      recent:patch(normalizeRecommendations(current.recent)).map(item=>({work:item.work,reason:item.reason,reason_code:item.reason_code})),
    }))
  }

  const openWork=(id:string)=>{window.location.href='/works/'+id}

  return <WorkspaceShell active="home" fandoms={fandoms}>
    <section className="view active home-v47">
      <section className="home-v47-hero">
        <div>
          <p className="eyebrow">NovaDrop 01 · Discovery & Creation</p>
          <h1>{payload.viewer?.authenticated?'Seu arquivo, agora feito para você.':'Descubra histórias sem ranking secreto.'}</h1>
          <p>Continue de onde parou, encontre autores que você acompanha e descubra obras fora do óbvio com recomendações explicadas.</p>
          <div className="home-v47-actions">
            <Link className="primary-button large" href="/explore">Explorar histórias</Link>
            <Link className="secondary-button large" href="/feed">Abrir meu feed</Link>
            <Link className="ghost-button large" href="/write">Escrever agora</Link>
          </div>
        </div>
        <aside className="home-v47-pulse">
          <div><span>ARQUIVO</span><strong>{fullNumber(stats.works)}</strong><small>obras públicas</small></div>
          <div><span>COMUNIDADE</span><strong>{fullNumber(stats.users)}</strong><small>contas ativas</small></div>
          <div><span>PALAVRAS</span><strong>{compactNumber(stats.words)}</strong><small>publicadas</small></div>
          {payload.viewer?.authenticated?<div><span>SUA BIBLIOTECA</span><strong>{fullNumber(payload.viewer.library_count||0)}</strong><small>{payload.viewer.unread_notifications||0} notificações não lidas</small></div>:null}
        </aside>
      </section>

      {error?<div className="community-message error">{error}<button type="button" onClick={()=>void load()}>Tentar novamente</button></div>:null}
      {loading?<div className="feed-skeleton home-v47-skeleton">{Array.from({length:6}).map((_,i)=><div key={i}/>)}</div>:null}

      {!loading&&continueReading.length?<section className="home-v47-section">
        <header><div><p className="eyebrow">Continue lendo</p><h2>Volte exatamente de onde parou.</h2></div><Link href="/library">Abrir biblioteca →</Link></header>
        <div className="continue-reading-grid">
          {continueReading.map(work=><Link className="continue-reading-card" href={`/works/${work.id}${work.last_chapter_id?`?chapter=${work.last_chapter_id}`:''}`} key={work.id}>
            <div><span>{Math.round(work.progress||0)}%</span><strong>{work.title}</strong><small>por @{work.author_username}</small></div>
            <div className="continue-progress"><i style={{width:`${Math.max(2,Math.min(100,work.progress||0))}%`}}/></div>
            <b><NovaIcon name="arrowRight" size={18}/></b>
          </Link>)}
        </div>
      </section>:null}

      {!loading&&recommended.length?<section className="home-v47-section">
        <header><div><p className="eyebrow">Para você</p><h2>Recomendações que explicam o porquê.</h2><p>Interesses vêm das suas leituras, fandoms, tags e autores seguidos — com espaço reservado para obras menores.</p></div><Link href="/feed">Ver feed completo →</Link></header>
        <div className="discovery-grid home-v47-work-grid">
          {recommended.slice(0,6).map(item=><div className="discovery-item" key={item.work.id}>
            <div className={`recommendation-reason reason-${(item.reason_code||'community').toLowerCase()}`}><span>✦</span>{item.reason}</div>
            <WorkCard work={item.work} onOpen={openWork} onBookmark={work=>void toggleBookmark(work)}/>
          </div>)}
        </div>
      </section>:null}

      {!loading&&following.length?<section className="home-v47-section">
        <header><div><p className="eyebrow">Autores que você segue</p><h2>Atualizações do seu círculo.</h2></div><Link href="/feed">Mais atualizações →</Link></header>
        <div className="work-grid">
          {following.slice(0,3).map(item=><WorkCard key={item.work.id} work={item.work} onOpen={openWork} onBookmark={work=>void toggleBookmark(work)}/>)}
        </div>
      </section>:null}

      {!loading&&fandoms.length?<section className="home-v47-section">
        <header><div><p className="eyebrow">Fandom Hubs</p><h2>Entre pelos universos que estão em movimento.</h2></div><Link href="/explore">Explorar tudo →</Link></header>
        <div className="category-grid home-v47-fandoms">
          {fandoms.slice(0,8).map((fandom,index)=><Link className="category-card" href={`/fandoms/${encodeURIComponent(fandom.slug)}`} key={fandom.id}>
            <span className="home-v4-fandom-index">{String(index+1).padStart(2,'0')}</span>
            <span className="category-icon">✦</span>
            <strong>{fandom.name}</strong>
            <span>{fullNumber(fandom.work_count)} obras · {compactNumber(fandom.total_words)} palavras</span>
          </Link>)}
        </div>
      </section>:null}

      {!loading&&recent.length?<section className="home-v47-section">
        <header><div><p className="eyebrow">Acabaram de chegar</p><h2>Novidades do arquivo.</h2></div><Link href="/explore?sort=recent">Ver recentes →</Link></header>
        <div className="work-grid">
          {recent.slice(0,3).map(item=><WorkCard key={item.work.id} work={item.work} onOpen={openWork} onBookmark={work=>void toggleBookmark(work)}/>)}
        </div>
      </section>:null}
    </section>
  </WorkspaceShell>
}
