import { VersionHistory } from '@/components/manage/version-history'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <VersionHistory workId={id}/>} 
