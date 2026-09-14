import { GroupManager } from '@/components/library/group-manager'
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <GroupManager kind="series" id={id}/>} 
