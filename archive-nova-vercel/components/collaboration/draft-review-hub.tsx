'use client'
import Link from 'next/link'
import { FormEvent,useCallback,useEffect,useMemo,useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { sanitizeStoryHtml } from '@/lib/writer-draft'

type Chapter={id:string;title:string;position:number;word_count:number;content_html:string}
type Collaborator={user_id:string;username:string;display_name:string;role:'COAUTHOR'|'BETA_READER';status:string}
type Comment={id:string;chapter_id:string;author_id:string;username:string;display_name:string;anchor_text:string|null;body:string;status:'OPEN'|'RESOLVED';created_at:string}
type Payload={draft:{id:string;title:string;owner_id:string;updated_at:string};chapters:Chapter[];collaborators:Collaborator[];comments:Comment[]}

export function DraftReviewHub({draftId}:{draftId:string}){
 const supabase=useMemo(()=>createClient(),[])
 const [payload,setPayload]=useState<Payload|null>(null);const [userId,setUserId]=useState('');const [active,setActive]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(true)
 const load=useCallback(async()=>{const user=(await supabase.auth.getUser()).data.user;setUserId(user?.id||'');const {data,error}=await supabase.rpc('get_draft_review',{target_draft:draftId});if(error){setMessage(error.message);setLoading(false);return}const p=data as Payload;setPayload(p);setActive(cur=>cur||p.chapters?.[0]?.id||'');setLoading(false)},[supabase,draftId])
 useEffect(()=>{void load()},[load])
 useEffect(()=>{if(!payload)return;const channel=supabase.channel('draft-review-'+draftId).on('postgres_changes',{event:'*',schema:'public',table:'draft_inline_comments',filter:'draft_id=eq.'+draftId},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[supabase,draftId,payload?.draft.id])
 async function invite(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget;const fd=new FormData(f);const {error}=await supabase.rpc('invite_draft_collaborator',{target_draft:draftId,target_username:String(fd.get('username')||''),target_role:String(fd.get('role')||'BETA_READER')});if(error)setMessage(error.message);else{f.reset();setMessage('Convite enviado.');await load()}}
 async function comment(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=e.currentTarget;const fd=new FormData(f);if(!active)return;const {error}=await supabase.rpc('add_draft_inline_comment',{target_draft:draftId,target_chapter:active,anchor:String(fd.get('anchor')||''),comment_body:String(fd.get('body')||'')});if(error)setMessage(error.message);else{f.reset();await load()}}
 async function resolve(id:string,status:boolean){await supabase.rpc('resolve_draft_inline_comment',{target_comment:id,resolved:status});await load()}
 if(loading)return <><NovaHeader title="Revisão"/><main className="draft-review-page"><div className="studio-loading"><span/><h1>Abrindo revisão…</h1></div></main></>
 if(!payload)return <><NovaHeader title="Revisão"/><main className="draft-review-page"><section className="library-empty"><h1>Sem acesso a este rascunho.</h1><Link className="primary-button" href="/collaboration">Voltar</Link></section></main></>
 const chapter=payload.chapters.find(c=>c.id===active)||payload.chapters[0]
 const owner=payload.draft.owner_id===userId
 const comments=payload.comments.filter(c=>c.chapter_id===chapter?.id)
 return <><NovaHeader title="Revisão"/><main className="draft-review-page"><header><div><p className="eyebrow">Beta reader & coautoria</p><h1>{payload.draft.title||'Rascunho sem título'}</h1><p>Feedback privado antes da publicação.</p></div><div>{owner?<Link className="primary-button" href={'/write/'+draftId}>Abrir Writer</Link>:null}<Link className="secondary-button" href="/collaboration">Colaborações</Link></div></header>
 {owner?<section className="draft-invite-card"><form onSubmit={invite}><div><h2>Convidar colaborador</h2><p>Use o username do Archive Nova.</p></div><input name="username" placeholder="@username" required/><select name="role"><option value="BETA_READER">Beta reader</option><option value="COAUTHOR">Coautor</option></select><button className="primary-button">Enviar convite</button></form><div className="draft-team">{payload.collaborators.map(c=><span key={c.user_id}><b>{c.display_name}</b><small>@{c.username} · {c.role} · {c.status}</small></span>)}</div></section>:null}
 <div className="draft-review-layout"><aside>{payload.chapters.map(c=><button key={c.id} className={c.id===chapter?.id?'active':''} onClick={()=>setActive(c.id)}><b>{String(c.position).padStart(2,'0')}</b><span>{c.title||'Sem título'}</span><small>{c.word_count} p.</small></button>)}</aside><section><article className="draft-review-paper"><h2>{chapter?.title||'Capítulo '+chapter?.position}</h2><div className="reader-rich-text" dangerouslySetInnerHTML={{__html:sanitizeStoryHtml(chapter?.content_html||'')}}/></article>
 <section className="draft-feedback"><header><h2>Comentários da revisão</h2><span>{comments.filter(c=>c.status==='OPEN').length} abertos</span></header><form onSubmit={comment}><input name="anchor" maxLength={500} placeholder="Trecho/âncora opcional"/><textarea name="body" required rows={4} maxLength={12000} placeholder="Comentário, sugestão ou dúvida…"/><button className="primary-button">Comentar</button></form><div>{comments.map(c=><article key={c.id} className={c.status==='RESOLVED'?'resolved':''}><header><strong>{c.display_name}</strong><small>@{c.username} · {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(c.created_at))}</small></header>{c.anchor_text?<blockquote>{c.anchor_text}</blockquote>:null}<p>{c.body}</p><button onClick={()=>void resolve(c.id,c.status!=='RESOLVED')}>{c.status==='RESOLVED'?'Reabrir':'Resolver'}</button></article>)}</div></section></section></div>
 {message?<div className="reader-page-toast" role="status">{message}</div>:null}</main></>
}
