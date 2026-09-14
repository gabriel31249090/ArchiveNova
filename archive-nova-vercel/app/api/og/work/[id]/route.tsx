import { ImageResponse } from 'next/og'
import { getPublicWorkSeo } from '@/lib/seo-public'

export const runtime='edge'

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params
  const work=await getPublicWorkSeo(id)
  if(!work)return new Response('Not found',{status:404})
  const fandom=work.fandoms[0]||'Archive Nova'
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',background:'#151116',color:'#f7edf1',padding:'72px 78px',fontFamily:'Georgia'}}>
      <div style={{display:'flex',alignItems:'center',gap:18,fontFamily:'Arial',fontSize:24,color:'#f05f80'}}>
        <div style={{width:48,height:48,borderRadius:13,background:'#ef5c7c',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:30}}>✦</div>
        <div>ARCHIVE NOVA</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:22,maxWidth:1020}}>
        <div style={{fontFamily:'Arial',fontSize:22,letterSpacing:2,color:'#bd7487',textTransform:'uppercase'}}>{fandom}</div>
        <div style={{fontSize:68,lineHeight:1.04,letterSpacing:-2}}>{work.title}</div>
        <div style={{fontFamily:'Arial',fontSize:28,color:'#b9aab0'}}>por {work.authorName}</div>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',fontFamily:'Arial',fontSize:20,color:'#756a70'}}>
        <div>{work.tags.slice(0,4).join('  ·  ')||'Histórias sem algoritmo'}</div>
        <div>archivenova.vercel.app</div>
      </div>
    </div>,
    {width:1200,height:630}
  )
}
