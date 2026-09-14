import { PublishWizard } from '@/components/publish/publish-wizard'

export default async function CloudPublishPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  return <PublishWizard draftId={draftId} />
}
