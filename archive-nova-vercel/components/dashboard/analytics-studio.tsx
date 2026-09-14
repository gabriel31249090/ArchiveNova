'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'

type ChapterAnalytic={id:string;work_id:string;work_title:string;chapter_number:number;title:string|null;hits:number;unique_30d:number;retention:number}
type Source={source:string;hits:number}

export function AnalyticsStudio(){
  const supabase=useMemo(()=>createClient(),[])
  const [chapters,setChapters]=useState<ChapterAnalytic[]>([])
  const [sources,setSources]=useState<Source[]>([])
  const [loading,setLoading]=useState(true)
  useEffect(()=>{void (async()=>{const {data}=await supabase.rpc('creator_analytics',{target_work:null});const p=(data||{}) as {chapters?:ChapterAnalytic[];sources?:Source[]};setChapters(p.chapters||[]);setSources(p.sources||[]);setLoading(false)})()},[supabase])
  const maxHits=Math.max(1,...chapters.map(x=>Number(x.hits||0)))
  const total=chapters.reduce((s,x)=>s+Number(x.hits||0),0)
  const avg=chapters.length?Math.round(chapters.reduce((s,x)=>s+Number(x.retention||0),0)/chapters.length):0
  return <><NovaHeader title="Analytics"/><main className="analytics-page"><header className="analytics-hero"><div><p className="eyebrow">Creator Studio+</p><h1>Leitura por capítulo</h1><p>Veja quais capítulos seguram leitores e de onde chegam as visitas.</p></div><Link className="secondary-button" href="/dashboard">Voltar ao Studio</Link></header>
  <section className="analytics-kpis"><article><strong>{total.toLocaleString('pt-BR')}</strong><span>leituras registradas</span></article><article><strong>{chapters.length}</strong><span>capítulos medidos</span></article><article><strong>{avg}%</strong><span>retenção média</span></article></section>
  {loading?<div className="studio-loading"><span/><h2>Calculando…</h2></div>:<><section className="analytics-chart"><header><h2>Retenção por capítulo</h2></header>{chapters.map(ch=><article key={ch.id}><div><strong>{ch.work_title}</strong><span>Cap. {ch.chapter_number} · {ch.title||'Sem título'}</span></div><div className="analytics-bar"><i style={{width:(Number(ch.hits||0)/maxHits*100)+'%'}}/><b>{Number(ch.hits||0).toLocaleString('pt-BR')}</b></div><span className="analytics-retention">{Math.round(Number(ch.retention||0))}%</span></article>)}</section><section className="analytics-sources"><h2>Origem de tráfego</h2>{sources.map(s=><div key={s.source}><strong>{s.source}</strong><span>{Number(s.hits||0).toLocaleString('pt-BR')}</span></div>)}</section></>}
  </main></>
}
