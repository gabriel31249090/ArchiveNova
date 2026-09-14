import type { Metadata } from 'next'
import { PublishWizard } from '@/components/publish/publish-wizard'
export const metadata: Metadata = { title: 'Publicar', robots: { index: false, follow: false } }
export default function PublishPage() { return <PublishWizard /> }
