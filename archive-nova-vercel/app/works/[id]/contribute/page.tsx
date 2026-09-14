import { CollaborationHub } from '@/components/collaboration/collaboration-hub'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CollaborationHub workId={id} />
}
