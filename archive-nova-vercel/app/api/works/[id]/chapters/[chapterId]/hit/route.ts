import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string;chapterId:string}>}){
 const {id,chapterId}=await params
 if(!UUID_RE.test(id)||!UUID_RE.test(chapterId))return NextResponse.json({error:'invalid_id'},{status:400})
 const admin=createAdminClient();const salt=process.env.HIT_HASH_SALT
 if(!admin||!salt)return new NextResponse(null,{status:204})
 const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
 const ip=forwarded||request.headers.get('x-real-ip')||'unknown';const ua=request.headers.get('user-agent')||'unknown';const day=new Date().toISOString().slice(0,10)
 const visitorHash=createHash('sha256').update(salt+'|'+day+'|'+ip+'|'+ua).digest('hex')
 const referer=request.headers.get('referer')||''
 let source='Direto'
 try{const url=new URL(referer);source=url.hostname===request.nextUrl.hostname?'Archive Nova':url.hostname.slice(0,80)}catch{}
 const {error}=await admin.from('chapter_hits').upsert({chapter_id:chapterId,work_id:id,visitor_hash:visitorHash,source,hit_day:day},{onConflict:'chapter_id,visitor_hash,hit_day',ignoreDuplicates:true})
 if(error)console.error('Archive Nova chapter hit tracking failed:',error.message)
 return new NextResponse(null,{status:204})
}
