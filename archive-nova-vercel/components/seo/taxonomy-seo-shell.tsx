import type { Metadata } from 'next'
import { TaxonomyPage } from '@/components/taxonomy/taxonomy-page'
import { JsonLd } from '@/components/seo/json-ld'
import { absoluteUrl } from '@/lib/site'
import { cleanDescription, getPublicTaxonomySeo } from '@/lib/seo-public'

export type TaxonomyKind='FANDOM'|'TAG'|'CHARACTER'|'RELATIONSHIP'

function config(kind:TaxonomyKind){
  if(kind==='FANDOM')return {base:'fandoms',label:'Fandom'}
  if(kind==='CHARACTER')return {base:'characters',label:'Personagem'}
  if(kind==='RELATIONSHIP')return {base:'relationships',label:'Relacionamento'}
  return {base:'tags',label:'Tag'}
}

export async function taxonomyMetadata(slug:string,kind:TaxonomyKind):Promise<Metadata>{
  const item=await getPublicTaxonomySeo(slug,kind)
  if(!item)return {title:'Índice indisponível',robots:{index:false,follow:false}}
  const {base,label}=config(kind)
  const description=cleanDescription(item.description,`${label} “${item.name}” no Archive Nova — ${item.workCount} obra(s) no índice.`)
  return {
    title:`${item.name} — ${label}`,
    description,
    alternates:{canonical:`/${base}/${encodeURIComponent(item.slug)}`},
    openGraph:{type:'website',title:`${item.name} — ${label}`,description,url:`/${base}/${encodeURIComponent(item.slug)}`,siteName:'Archive Nova',locale:'pt_BR'},
    twitter:{card:'summary',title:`${item.name} — ${label}`,description},
    robots:{index:true,follow:true},
  }
}

export async function TaxonomySeoShell({slug,kind}:{slug:string;kind:TaxonomyKind}){
  const item=await getPublicTaxonomySeo(slug,kind)
  const {base,label}=config(kind)
  const jsonLd=item?{
    '@context':'https://schema.org',
    '@graph':[
      {'@type':'CollectionPage',name:item.name,description:cleanDescription(item.description,`${label} no Archive Nova.`,500),url:absoluteUrl(`/${base}/${encodeURIComponent(item.slug)}`),numberOfItems:item.workCount},
      {'@type':'BreadcrumbList',itemListElement:[
        {'@type':'ListItem',position:1,name:'Archive Nova',item:absoluteUrl('/')},
        {'@type':'ListItem',position:2,name:label,item:absoluteUrl('/explore')},
        {'@type':'ListItem',position:3,name:item.name,item:absoluteUrl(`/${base}/${encodeURIComponent(item.slug)}`)},
      ]},
    ],
  }:null
  return <>{jsonLd?<JsonLd value={jsonLd}/>:null}<TaxonomyPage slug={slug} kind={kind}/></>
}
