import type { Metadata } from 'next'
import { CreatorCommentsCenter } from '@/components/dashboard/creator-comments-center'
export const metadata: Metadata = { title: 'Comentários do escritor', robots: { index: false, follow: false } }
export default function CreatorCommentsPage() { return <CreatorCommentsCenter /> }
