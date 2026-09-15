import { TaxonomySeoShell, taxonomyMetadata } from '@/components/seo/taxonomy-seo-shell'
import '../../novadrop-v47-shared.css'

export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return taxonomyMetadata(slug,'RELATIONSHIP')}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <TaxonomySeoShell kind="RELATIONSHIP" slug={slug}/>} 
