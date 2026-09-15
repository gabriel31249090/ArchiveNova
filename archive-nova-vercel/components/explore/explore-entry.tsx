'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { ExploreV47 } from '@/components/explore/explore-v47'

const LegacyArchiveNovaApp=dynamic(
  ()=>import('@/components/archive-nova-app').then(module=>module.ArchiveNovaApp),
  {
    ssr:false,
    loading:()=> <main className="auth-route-loading"><span>✦</span><h1>Abrindo sua conta…</h1></main>,
  },
)

export function ExploreEntry(){
  const params=useSearchParams()
  const auth=params.get('auth')
  if(auth==='login'||auth==='register')return <LegacyArchiveNovaApp initialView="explore"/>
  return <ExploreV47/>
}
