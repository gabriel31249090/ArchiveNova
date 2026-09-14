import { ScheduleManager } from '@/components/manage/schedule-manager'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ScheduleManager workId={id}/>} 
