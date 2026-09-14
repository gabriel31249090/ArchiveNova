import { CloudStoryEditor } from '@/components/editor/cloud-story-editor'

export default async function DraftWriterPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  return <CloudStoryEditor draftId={draftId} />
}
