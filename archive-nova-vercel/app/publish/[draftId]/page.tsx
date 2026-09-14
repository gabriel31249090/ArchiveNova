import type { Metadata } from 'next'
import { PublishWizard } from '@/components/publish/publish-wizard'
export const metadata: Metadata = { title: 'Publicar rascunho', robots: { index: false, follow: false } }
export default async function CloudPublishPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  return <PublishWizard draftId={draftId} />
}
