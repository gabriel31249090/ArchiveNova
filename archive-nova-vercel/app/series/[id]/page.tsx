import { PublicListSeoShell, publicListMetadata } from '@/components/seo/public-list-seo-shell'

export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;return publicListMetadata(id,'series')}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PublicListSeoShell kind="series" id={id}/>} 
