'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { ContributionHeatmap } from '@/components/profile/contribution-heatmap'
import { NovaIcon } from '@/components/ui/nova-icon'
import { useNovaConfirm } from '@/components/ui/nova-confirm'
import { normalizeWorkCard } from '@/lib/work-normalize'
import { useFeatureFlags } from '@/hooks/use-feature-flags'
import type { SupportProfile, WorkCardData } from '@/lib/types'

function formatNumber(value:number){return new Intl.NumberFormat('pt-BR',{notation:value>=10000?'compact':'standard',maximumFractionDigits:1}).format(value||0)}

type PublicSeries={id:string;title:string;summary:string;slug:string|null;updated_at:string;work_count:number}
type PublicCollection={id:string;name:string;description:string|null;slug:string;updated_at:string;work_count:number}
type ProfilePayload={
  profile:{
    id:string;username:string;display_name:string|null;bio:string|null;created_at:string;
    role?:'USER'|'MODERATOR'|'ADMIN';avatar_url?:string|null;banner_url?:string|null;
    website_url?:string|null;location?:string|null;favorite_fandoms?:string[];
    featured_work_id?:string|null
  }
  stats:{works:number;words:number;hits:number;kudos:number;followers:number;following?:number}
  viewer:{is_self:boolean;following:boolean;blocked:boolean}
  works:Record<string,unknown>[]
  featured_work?:Record<string,unknown>|null
  series?:PublicSeries[]
  collections?:PublicCollection[]
}
type ProfilePost={id:string;body:string;image_urls:string[];likes_count:number;comments_count:number;created_at:string}
type CalendarDay={date:string;count:number}

export function PublicProfilePage({username}:{username:string}){
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase=useMemo(()=>configured?createClient():null,[configured])
  const {ask:confirmAction,dialog:confirmDialog}=useNovaConfirm()
  const [user,setUser]=useState<User|null>(null)
  const [payload,setPayload]=useState<ProfilePayload|null>(null)
  const [works,setWorks]=useState<WorkCardData[]>([])
  const [calendar,setCalendar]=useState<CalendarDay[]>([])
  const [posts,setPosts]=useState<ProfilePost[]>([])
  const [support,setSupport]=useState<SupportProfile|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  const { flags }=useFeatureFlags()
  const profileV2=flags.profile_v2!==false

  async function load(){
    if(!supabase){setLoading(false);setError('Supabase não configurado.');return}
    const current=(await supabase.auth.getUser()).data.user||null
    setUser(current)
    const {data,error:profileError}=await supabase.rpc('get_public_profile',{profile_username:decodeURIComponent(username)})
    if(profileError){
      console.error(profileError)
      setError(profileError.message?.includes('PROFILE_BLOCKED')?'Este perfil não está disponível para esta conta.':'Perfil não encontrado.')
      setLoading(false);return
    }
    const next=data as ProfilePayload
    setPayload(next)
    setWorks((next.works||[]).map(normalizeWorkCard))
    const [calendarResponse,supportResponse,postResponse]=await Promise.all([
      supabase.rpc('profile_contribution_calendar',{profile_username:next.profile.username}),
      supabase.from('creator_support_profiles').select('*').eq('user_id',next.profile.id).maybeSingle(),
      supabase.from('community_posts').select('id,body,image_urls,likes_count,comments_count,created_at').eq('author_id',next.profile.id).is('deleted_at',null).order('created_at',{ascending:false}).limit(4),
    ])
    setCalendar(((calendarResponse.data||[]) as Array<Record<string,unknown>>).map(row=>({date:String(row.date||''),count:Number(row.count||0)})))
    setSupport(supportResponse.data?supportResponse.data as SupportProfile:null)
    setPosts((postResponse.data||[]) as ProfilePost[])
    setLoading(false)
  }

  useEffect(()=>{void load()},[username,supabase])

  function requireLogin(){
    if(user)return true
    window.location.href='/explore?auth=login&return='+encodeURIComponent('/users/'+username)
    return false
  }

  async function toggleFollow(){
    if(!payload||!supabase||!requireLogin())return
    setBusy(true)
    const {data,error:followError}=await supabase.rpc('toggle_user_subscription',{target_author:payload.profile.id})
    setBusy(false)
    if(followError){setMessage('Não foi possível alterar o acompanhamento deste autor.');return}
    setPayload(current=>current?{
      ...current,
      viewer:{...current.viewer,following:Boolean(data)},
      stats:{...current.stats,followers:Math.max(0,current.stats.followers+(data?1:-1))}
    }:current)
    setMessage(data?'Você agora segue este autor.':'Você deixou de seguir este autor.')
  }

  async function toggleBlock(){
    if(!payload||!supabase||!requireLogin())return
    const willBlock=!payload.viewer.blocked
    if(willBlock&&!(await confirmAction({
      title:'Bloquear @'+payload.profile.username+'?',
      description:'As obras deste autor deixarão de aparecer para você e o acompanhamento será removido.',
      confirmLabel:'Bloquear autor',tone:'danger'
    })))return
    setBusy(true)
    const {data,error:blockError}=await supabase.rpc('toggle_user_block',{target_user:payload.profile.id})
    setBusy(false)
    if(blockError){setMessage('Não foi possível alterar o bloqueio.');return}
    setPayload(current=>current?{...current,viewer:{...current.viewer,blocked:Boolean(data),following:data?false:current.viewer.following}}:current)
    setMessage(data?'Autor bloqueado.':'Bloqueio removido.')
  }

  if(loading)return <><NovaHeader/><main className="profile-page"><div className="studio-loading"><span/><h1>Carregando perfil…</h1></div></main></>
  if(error||!payload)return <><NovaHeader/><main className="profile-page"><div className="profile-not-found"><span>✦</span><h1>{error||'Perfil não encontrado.'}</h1><p>O usuário pode ter alterado o nome, desativado a conta ou estar indisponível para você.</p><Link className="primary-button" href="/explore">Voltar para explorar</Link></div></main></>

  const {profile,stats,viewer}=payload
  const joined=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(profile.created_at))
  const featured=payload.featured_work?normalizeWorkCard(payload.featured_work):null
  const favoriteFandoms=profile.favorite_fandoms||[]

  return <>
    <NovaHeader/>
    <main className="profile-page profile-v47">
      <section
        className={'profile-cover profile-cover-v47 '+(profile.banner_url?'has-image':'')}
        style={profileV2&&profile.banner_url?{backgroundImage:'linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.45)),url("'+profile.banner_url.replaceAll('"','%22')+'")'}:undefined}
      ><div className="profile-orbit one"/><div className="profile-orbit two"/></section>

      <section className="profile-hero profile-hero-v47">
        <div className="profile-avatar-large profile-avatar-v47">
          {profileV2&&profile.avatar_url?<img src={profile.avatar_url} alt={'Avatar de '+(profile.display_name||profile.username)}/>:<span>{(profile.display_name||profile.username).slice(0,1).toUpperCase()}</span>}
          <i>✦</i>
        </div>
        <div className="profile-identity">
          <p className="eyebrow">Perfil público</p>
          <h1>{profile.display_name||profile.username}</h1>
          <div className="profile-handle-row">
            <span>@{profile.username}</span>
            {profile.role==='ADMIN'?<b className="profile-role-badge admin">✦ Administrador</b>:profile.role==='MODERATOR'?<b className="profile-role-badge moderator">◆ Moderador</b>:null}
          </div>
          <p className="profile-bio">{profile.bio||'Este autor ainda não escreveu uma bio.'}</p>
          {profileV2?<div className="profile-meta-v47">
            {profile.location?<span><NovaIcon name="user" size={14}/>{profile.location}</span>:null}
            {profile.website_url?<a href={profile.website_url} target="_blank" rel="noreferrer"><NovaIcon name="external" size={14}/>Site</a>:null}
            <span>No Archive Nova desde {joined}.</span>
          </div>:null}
          {profileV2&&favoriteFandoms.length?<div className="profile-fandoms-v47">{favoriteFandoms.map(item=><span key={item}>✦ {item}</span>)}</div>:null}
        </div>

        <div className="profile-actions">
          {viewer.is_self?
            <div className="profile-self-actions">
              {profile.role==='ADMIN'?<Link className="primary-button large" href="/admin">Abrir Admin Center</Link>:null}
              <Link className="primary-button large" href="/dashboard">Abrir Creator Studio</Link>
              <Link className="secondary-button large" href="/settings/profile">Editar perfil</Link>
              <Link className="secondary-button large" href="/settings/support">Configurar apoio</Link>
            </div>
          :
            <div className="profile-self-actions">
              <button className={'primary-button large '+(viewer.following?'following':'')} disabled={busy||viewer.blocked} onClick={()=>void toggleFollow()}>{viewer.following?<><NovaIcon name="check" size={17}/> Seguindo</>:<><NovaIcon name="plus" size={17}/> Seguir autor</>}</button>
              {support?.enabled?<Link className="secondary-button large support-profile-button" href={'/support/'+encodeURIComponent(profile.username)}><NovaIcon name="heart" size={17}/> Apoiar</Link>:null}
            </div>
          }
          {!viewer.is_self&&user?<button className="profile-more-button" type="button" onClick={()=>void toggleBlock()} disabled={busy}>{viewer.blocked?'Desbloquear':'Bloquear'}</button>:null}
        </div>
      </section>

      {message?<div className="profile-message" role="status">{message}</div>:null}

      <section className="profile-stats profile-stats-v47">
        <div><strong>{formatNumber(stats.works)}</strong><span>obras</span></div>
        <div><strong>{formatNumber(stats.words)}</strong><span>palavras</span></div>
        <div><strong>{formatNumber(stats.hits)}</strong><span>leituras</span></div>
        <div><strong>{formatNumber(stats.kudos)}</strong><span>kudos</span></div>
        <div><strong>{formatNumber(stats.followers)}</strong><span>seguidores</span></div>
        <div><strong>{formatNumber(stats.following||0)}</strong><span>seguindo</span></div>
      </section>

      {profileV2&&featured?<section className="profile-featured-v47">
        <div><p className="eyebrow">Destaque do autor</p><h2>{featured.title}</h2><p>{featured.summary||'Sem resumo.'}</p><div><span>{formatNumber(featured.word_count)} palavras</span><span>{featured.chapter_count} cap.</span><span><NovaIcon name="heart" size={15}/> {formatNumber(featured.kudos_count)}</span></div></div>
        <Link className="primary-button" href={'/works/'+featured.id}>Ler obra <NovaIcon name="arrowRight" size={16}/></Link>
      </section>:null}

      <ContributionHeatmap days={calendar}/>

      {profileV2&&((payload.series||[]).length||(payload.collections||[]).length)?<section className="profile-groups-v47">
        {(payload.series||[]).length?<div><header><p className="eyebrow">Séries</p><h2>Séries públicas</h2></header>{payload.series?.map(item=><Link key={item.id} href={'/series/'+item.id}><div><strong>{item.title}</strong><p>{item.summary||'Sem descrição.'}</p></div><span>{item.work_count} obras <NovaIcon name="arrowRight" size={15}/></span></Link>)}</div>:null}
        {(payload.collections||[]).length?<div><header><p className="eyebrow">Coleções</p><h2>Coleções públicas</h2></header>{payload.collections?.map(item=><Link key={item.id} href={'/collections/'+item.id}><div><strong>{item.name}</strong><p>{item.description||'Sem descrição.'}</p></div><span>{item.work_count} obras <NovaIcon name="arrowRight" size={15}/></span></Link>)}</div>:null}
      </section>:null}

      {posts.length?<section className="profile-posts"><header><div><p className="eyebrow">Comunidade</p><h2>Posts recentes</h2></div><Link href="/posts">Ver todos os posts →</Link></header><div>{posts.map(post=><article key={post.id}><p>{post.body||'Post com imagem'}</p>{post.image_urls?.[0]?<img src={post.image_urls[0]} alt="Imagem do post"/>:null}<footer><span><NovaIcon name="heart" size={14}/> {post.likes_count}</span><span><NovaIcon name="comment" size={14}/> {post.comments_count}</span><small>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(post.created_at))}</small></footer></article>)}</div></section>:null}

      <section className="profile-library">
        <header><div><p className="eyebrow">Arquivo de @{profile.username}</p><h2>Histórias publicadas</h2></div><span>{works.length} obra{works.length===1?'':'s'}</span></header>
        {works.length?<div className="profile-work-grid">{works.map(work=><article className="profile-work-card" key={work.id}><div className="profile-work-card-top"><span className="rating-badge">{work.rating==='GENERAL'?'G':work.rating==='TEEN'?'T':work.rating==='MATURE'?'M':work.rating==='EXPLICIT'?'E':'?'}</span><span>{work.status==='COMPLETE'?'Concluída':work.status==='HIATUS'?'Hiato':'Em andamento'}</span></div><div><Link href={'/works/'+work.id}><h3>{work.title}</h3></Link><p>{work.summary||'Sem resumo.'}</p></div><div className="profile-work-tags">{work.fandoms.slice(0,2).map(tag=><span key={tag}>{tag}</span>)}{work.tags.slice(0,2).map(tag=><span key={tag}>{tag}</span>)}</div><footer><span>{formatNumber(work.word_count)} palavras</span><span><NovaIcon name="heart" size={14}/> {formatNumber(work.kudos_count)}</span><span><NovaIcon name="eye" size={14}/> {formatNumber(work.hits_count)}</span>{work.allow_contributions?<Link href={'/works/'+work.id+'/contribute'}><NovaIcon name="branch" size={15}/> Contribuir</Link>:null}</footer></article>)}</div>:<div className="studio-empty large"><span>✎</span><h2>Nenhuma obra pública ainda</h2><p>Quando @{profile.username} publicar uma história, ela aparecerá aqui.</p></div>}
      </section>

      {confirmDialog}
    </main>
  </>
}
