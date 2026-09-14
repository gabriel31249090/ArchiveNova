import { TaxonomyPage } from '@/components/taxonomy/taxonomy-page'
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <TaxonomyPage kind="RELATIONSHIP" slug={slug}/>} 
