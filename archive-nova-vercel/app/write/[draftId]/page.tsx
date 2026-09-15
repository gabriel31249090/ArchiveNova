import type { Metadata } from 'next'
import { CloudStoryEditor } from '@/components/editor/cloud-story-editor'
import { WriterExperienceDock } from '@/components/editor/writer-experience-dock'
export const metadata: Metadata = { title: 'Writer Workspace', robots: { index: false, follow: false } }
export default async function DraftWriterPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params
  return <><CloudStoryEditor draftId={draftId}/><WriterExperienceDock draftId={draftId}/></>
}
