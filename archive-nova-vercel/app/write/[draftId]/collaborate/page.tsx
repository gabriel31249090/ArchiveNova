import type { Metadata } from 'next'
import { DraftReviewHub } from '@/components/collaboration/draft-review-hub'
export const metadata:Metadata={title:'Revisão de rascunho',robots:{index:false,follow:false}}
export default async function Page({params}:{params:Promise<{draftId:string}>}){const {draftId}=await params;return <DraftReviewHub draftId={draftId}/>} 
