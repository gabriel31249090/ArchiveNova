import { TaxonomySeoShell, taxonomyMetadata } from '@/components/seo/taxonomy-seo-shell'

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return taxonomyMetadata(slug,'CHARACTER')}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <TaxonomySeoShell kind="CHARACTER" slug={slug}/>} 
