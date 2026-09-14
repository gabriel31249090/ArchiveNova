import type { Metadata } from 'next'
import { ModerationCenter } from '@/components/moderation/moderation-center'
export const metadata: Metadata = { title: 'Moderação', robots: { index: false, follow: false } }
export default function ModerationPage() { return <ModerationCenter /> }
