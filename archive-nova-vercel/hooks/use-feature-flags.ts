'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type NovaFeatureFlag =
  | 'discovery_v2'
  | 'personalized_home'
  | 'profile_v2'
  | 'fandom_hubs'
  | 'saved_searches'

type Flags=Partial<Record<NovaFeatureFlag,boolean>>

const DEFAULTS:Record<NovaFeatureFlag,boolean>={
  discovery_v2:true,
  personalized_home:true,
  profile_v2:true,
  fandom_hubs:true,
  saved_searches:true,
}

const CACHE_KEY='archiveNovaFeatureFlags:v1'
const CACHE_TTL=5*60*1000

function readCache():Flags|null{
  if(typeof window==='undefined')return null
  try{
    const raw=window.localStorage.getItem(CACHE_KEY)
    if(!raw)return null
    const parsed=JSON.parse(raw) as {at?:number;flags?:Flags}
    if(!parsed.at||!parsed.flags||Date.now()-parsed.at>CACHE_TTL)return null
    return parsed.flags
  }catch{return null}
}

export function useFeatureFlags(){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const [flags,setFlags]=useState<Flags>(DEFAULTS)

  useEffect(()=>{
    const cached=readCache()
    if(cached)setFlags({...DEFAULTS,...cached})
    if(!supabase)return
    let active=true
    void supabase.rpc('public_feature_flags').then(({data,error})=>{
      if(!active||error||!data)return
      const next={...DEFAULTS,...(data as Flags)}
      setFlags(next)
      try{window.localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),flags:next}))}catch{}
    })
    return()=>{active=false}
  },[supabase])

  return {
    flags:{...DEFAULTS,...flags},
    enabled:(key:NovaFeatureFlag)=>({...DEFAULTS,...flags})[key]!==false,
  }
}
