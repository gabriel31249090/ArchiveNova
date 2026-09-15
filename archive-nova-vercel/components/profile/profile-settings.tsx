'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'
import { useFeatureFlags } from '@/hooks/use-feature-flags'

type OwnWork={id:string;title:string;status:string;visibility:string}

export function ProfileSettings() {
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const [user,setUser]=useState<User|null>(null)
  const [username,setUsername]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [bio,setBio]=useState('')
  const [avatarUrl,setAvatarUrl]=useState('')
  const [bannerUrl,setBannerUrl]=useState('')
  const [websiteUrl,setWebsiteUrl]=useState('')
  const [location,setLocation]=useState('')
  const [favoriteFandoms,setFavoriteFandoms]=useState('')
  const [featuredWorkId,setFeaturedWorkId]=useState('')
  const [works,setWorks]=useState<OwnWork[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const { flags }=useFeatureFlags()
  const profileV2=flags.profile_v2!==false

  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    let active=true
    void (async()=>{
      const current=(await supabase.auth.getUser()).data.user||null
      if(!active)return
      setUser(current)
      if(!current){setLoading(false);return}
      const [profileResponse,worksResponse]=await Promise.all([
        supabase.from('profiles').select('username,display_name,bio,avatar_url,banner_url,website_url,location,favorite_fandoms,featured_work_id').eq('id',current.id).maybeSingle(),
        supabase.from('public_work_cards').select('id,title,status,visibility').eq('creator_id',current.id).order('updated_at',{ascending:false}),
      ])
      if(!active)return
      if(profileResponse.error||!profileResponse.data){setError('Não foi possível carregar seu perfil.');setLoading(false);return}
      const data=profileResponse.data
      setUsername(String(data.username||''))
      setDisplayName(String(data.display_name||''))
      setBio(String(data.bio||''))
      setAvatarUrl(String(data.avatar_url||''))
      setBannerUrl(String(data.banner_url||''))
      setWebsiteUrl(String(data.website_url||''))
      setLocation(String(data.location||''))
      setFavoriteFandoms(Array.isArray(data.favorite_fandoms)?data.favorite_fandoms.map(String).join(', '):'')
      setFeaturedWorkId(String(data.featured_work_id||''))
      setWorks((worksResponse.data||[]).map(row=>({id:String(row.id),title:String(row.title),status:String(row.status),visibility:String(row.visibility)})))
      setLoading(false)
    })()
    return()=>{active=false}
  },[supabase])

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!supabase||!user)return
    const cleanDisplay=displayName.trim()
    const cleanBio=bio.trim()
    if(cleanDisplay.length>120)return setError('O nome de exibição deve ter no máximo 120 caracteres.')
    if(cleanBio.length>4000)return setError('A bio deve ter no máximo 4.000 caracteres.')
    const fandoms=Array.from(new Set(favoriteFandoms.split(',').map(item=>item.trim()).filter(Boolean))).slice(0,12)

    setBusy(true);setError('');setMessage('')
    const {error:updateError}=await supabase.rpc('update_profile_v2',{
      next_display_name:cleanDisplay,
      next_bio:cleanBio,
      next_avatar_url:avatarUrl.trim()||null,
      next_banner_url:bannerUrl.trim()||null,
      next_website_url:websiteUrl.trim()||null,
      next_location:location.trim()||null,
      next_favorite_fandoms:fandoms,
      next_featured_work:featuredWorkId||null,
    })
    setBusy(false)
    if(updateError){
      const copy=updateError.message.includes('INVALID_')?'Confira se os links começam com http:// ou https://.':updateError.message
      setError(copy||'Não foi possível salvar o perfil.')
      return
    }
    setMessage('Perfil atualizado.')
    window.setTimeout(()=>setMessage(''),2500)
  }

  if(loading)return <><NovaHeader title="Perfil"/><main className="settings-page"><div className="studio-loading"><span/><h1>Carregando perfil…</h1></div></main></>
  if(!user)return <><NovaHeader title="Perfil"/><main className="settings-page"><div className="studio-gate"><span>◎</span><h1>Entre para editar seu perfil.</h1><Link className="primary-button" href="/explore?auth=login&return=/settings/profile">Entrar</Link></div></main></>

  const previewLetter=(displayName||username||'U').slice(0,1).toUpperCase()

  return <>
    <NovaHeader title="Perfil"/>
    <main className="settings-page profile-settings-v47">
      <section className="settings-head"><div><p className="eyebrow">Perfil 2.0</p><h1>Seu espaço no Archive Nova</h1><p>Personalize sua identidade sem transformar o arquivo em uma disputa por números.</p></div><Link className="secondary-button" href={'/users/'+encodeURIComponent(username)}>Ver perfil público ↗</Link></section>

      <form className="profile-settings-grid-v47" onSubmit={submit}>
        {profileV2?<aside className="profile-settings-preview-v47">
          <div className="profile-settings-banner-v47" style={bannerUrl?{backgroundImage:'linear-gradient(180deg,transparent,rgba(0,0,0,.22)),url("'+bannerUrl.replaceAll('"','%22')+'")'}:undefined}/>
          <div className="profile-settings-avatar-v47">{avatarUrl?<img src={avatarUrl} alt="Prévia do avatar"/>:<span>{previewLetter}</span>}<i>✦</i></div>
          <strong>{displayName||username}</strong><small>@{username}</small>
          {location?<p><NovaIcon name="user" size={14}/> {location}</p>:null}
          {websiteUrl?<a href={websiteUrl} target="_blank" rel="noreferrer"><NovaIcon name="external" size={14}/> Site</a>:null}
        </aside>:null}

        <section className="settings-card profile-settings-fields-v47">
          <div className="settings-form-fields">
            <div className={profileV2?'profile-settings-row-v47':''}>
              <label>Nome de exibição<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={120} placeholder={username}/><small>Seu @username continua sendo @{username}.</small></label>
              {profileV2?<label>Localização opcional<input value={location} onChange={e=>setLocation(e.target.value)} maxLength={120} placeholder="Ex.: Brasil"/></label>:null}
            </div>

            <label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} rows={7} maxLength={4000} placeholder="Conte sobre você, seus fandoms e o que gosta de escrever…"/><small>{bio.length}/4000</small></label>

            {profileV2?<><div className="profile-settings-row-v47">
              <label>Avatar por URL<input type="url" value={avatarUrl} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://…"/><small>Imagem quadrada funciona melhor.</small></label>
              <label>Banner por URL<input type="url" value={bannerUrl} onChange={e=>setBannerUrl(e.target.value)} placeholder="https://…"/><small>Imagem horizontal para o topo do perfil.</small></label>
            </div>

            <label>Site / portfólio<input type="url" value={websiteUrl} onChange={e=>setWebsiteUrl(e.target.value)} placeholder="https://…"/></label>
            <label>Fandoms favoritos<input value={favoriteFandoms} onChange={e=>setFavoriteFandoms(e.target.value)} placeholder="Archive Nova, Fantasia, Ficção científica"/><small>Separe por vírgulas. Até 12 itens; você escolhe se quer mostrar isso publicamente.</small></label>

            <label>Obra destacada<select value={featuredWorkId} onChange={e=>setFeaturedWorkId(e.target.value)}><option value="">Nenhuma obra destacada</option>{works.map(work=><option key={work.id} value={work.id}>{work.title} · {work.status}</option>)}</select><small>Aparece em destaque no topo do seu perfil quando a obra estiver pública.</small></label></>:null}

            {error?<div className="studio-alert error">{error}</div>:null}
            {message?<div className="studio-alert success">{message}</div>:null}
            <div className="settings-actions"><Link className="ghost-button" href="/dashboard">Cancelar</Link><button className="primary-button large" disabled={busy}>{busy?'Salvando…':'Salvar perfil'}</button></div>
          </div>
        </section>
      </form>
    </main>
  </>
}
