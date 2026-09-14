'use client'
import Link from 'next/link'
import { useEffect,useMemo,useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'

type Owned={id:string;title:string;updated_at:string;collaborators:number}
type Shared={id:string;title:string;updated_at:string;role:'COAUTHOR'|'BETA_READER';status:'PENDING'|'ACCEPTED'|'DECLINED';owner_username:string;owner_display_name:string}

export function CollaborationStudio(){
 const supabase=useMemo(()=>createClient(),[])
 const [owned,setOwned]=useState<Owned[]>([]);const [shared,setShared]=useState<Shared[]>([]);const [loading,setLoading]=useState(true);const [message,setMessage]=useState('')
 async function load(){const {data,error}=await supabase.rpc('my_draft_collaborations');if(error)setMessage(error.message);const p=(data||{}) as {owned?:Owned[];shared?:Shared[]};setOwned(p.owned||[]);setShared(p.shared||[]);setLoading(false)}
 useEffect(()=>{void load()},[])
 async function respond(id:string,accept:boolean){const {error}=await supabase.rpc('respond_draft_invite',{target_draft:id,accept_invite:accept});if(error)setMessage(error.message);else{setMessage(accept?'Convite aceito.':'Convite recusado.');await load()}}
 return <><NovaHeader title="Colaboração"/><main className="draft-collab-page"><header><div><p className="eyebrow">Archive Nova Collaboration</p><h1>Escrever junto sem perder controle.</h1><p>Coautores editam no Writer Cloud com proteção de conflitos. Beta readers comentam trechos antes da publicação.</p></div><Link className="primary-button" href="/write">Novo rascunho</Link></header>
 {loading?<div className="studio-loading"><span/><h2>Carregando colaborações…</h2></div>:<>
 <section className="collab-studio-section"><header><h2>Seus rascunhos</h2><span>{owned.length}</span></header><div>{owned.map(d=><article key={d.id}><div><strong>{d.title||'Sem título'}</strong><small>{d.collaborators} colaborador(es)</small></div><div><Link href={'/write/'+d.id}>Editar</Link><Link className="primary-button" href={'/write/'+d.id+'/collaborate'}>Equipe e feedback</Link></div></article>)}</div></section>
 <section className="collab-studio-section"><header><h2>Compartilhados com você</h2><span>{shared.length}</span></header><div>{shared.map(d=><article key={d.id}><div><strong>{d.title||'Sem título'}</strong><p>por @{d.owner_username} · {d.role==='COAUTHOR'?'Coautor':'Beta reader'}</p><small>{d.status}</small></div><div>{d.status==='PENDING'?<><button onClick={()=>void respond(d.id,true)}>Aceitar</button><button onClick={()=>void respond(d.id,false)}>Recusar</button></>:d.status==='ACCEPTED'?<>{d.role==='COAUTHOR'?<Link href={'/write/'+d.id}>Abrir Writer</Link>:null}<Link className="primary-button" href={'/write/'+d.id+'/collaborate'}>Revisar</Link></>:null}</div></article>)}</div></section></>}
 {message?<div className="reader-page-toast" role="status">{message}</div>:null}</main></>
}
