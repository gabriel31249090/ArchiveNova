import { PublicListPage } from '@/components/library/public-list-page'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PublicListPage kind="shelf" id={id}/>} 
