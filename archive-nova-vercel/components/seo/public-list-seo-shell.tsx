import type { Metadata } from 'next'
import { PublicListPage } from '@/components/library/public-list-page'
import { JsonLd } from '@/components/seo/json-ld'
import { absoluteUrl } from '@/lib/site'
import { cleanDescription, getPublicListSeo, type PublicListSeo } from '@/lib/seo-public'

export type PublicListKind=PublicListSeo['kind']

function label(kind:PublicListKind){return kind==='series'?'Série':kind==='collections'?'Coleção':'Estante'}

export async function publicListMetadata(id:string,kind:PublicListKind):Promise<Metadata>{
  const item=await getPublicListSeo(id,kind)
  if(!item)return {title:'Lista indisponível',robots:{index:false,follow:false}}
  const description=cleanDescription(item.description,`${label(kind)} “${item.title}” por ${item.ownerName || 'um membro'} no Archive Nova.`)
  return {
    title:`${item.title} — ${label(kind)}`,
    description,
    alternates:{canonical:`/${kind}/${encodeURIComponent(item.id)}`},
    openGraph:{type:'website',title:item.title,description,url:`/${kind}/${encodeURIComponent(item.id)}`,siteName:'Archive Nova',locale:'pt_BR'},
    twitter:{card:'summary',title:item.title,description},
    robots:{index:true,follow:true},
  }
}

export async function PublicListSeoShell({id,kind}:{id:string;kind:PublicListKind}){
  const item=await getPublicListSeo(id,kind)
  const jsonLd=item?{
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'CollectionPage',name:item.title,description:cleanDescription(item.description,`${label(kind)} no Archive Nova.`,500),url:absoluteUrl(`/${kind}/${encodeURIComponent(item.id)}`),numberOfItems:item.workCount,author:item.ownerName?{'@type':'Person',name:item.ownerName,url:item.ownerUsername?absoluteUrl(`/users/${encodeURIComponent(item.ownerUsername)}`):undefined}:undefined},
      {'@type':'BreadcrumbList',itemListElement:[
        {'@type':'ListItem',position:1,name:'Archive Nova',item:absoluteUrl('/')},
        {'@type':'ListItem',position:2,name:label(kind),item:absoluteUrl(`/${kind}/${encodeURIComponent(item.id)}`)},
        {'@type':'ListItem',position:3,name:item.title,item:absoluteUrl(`/${kind}/${encodeURIComponent(item.id)}`)},
      ]},
    ],
  }:null
  const clientKind=kind==='collections'?'collection':kind==='shelves'?'shelf':'series'
  return <>{jsonLd?<JsonLd value={jsonLd}/>:null}<PublicListPage kind={clientKind} id={id}/></>
}
