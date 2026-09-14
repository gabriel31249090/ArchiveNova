import type { Metadata } from 'next'
import { CollaborationStudio } from '@/components/collaboration/collaboration-studio'
export const metadata:Metadata={title:'Colaboração',robots:{index:false,follow:false}}
export default function Page(){return <CollaborationStudio/>}
