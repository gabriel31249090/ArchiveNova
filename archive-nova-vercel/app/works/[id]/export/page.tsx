import { ExportWorkPage } from '@/components/manage/export-work-page'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ExportWorkPage workId={id}/>} 
