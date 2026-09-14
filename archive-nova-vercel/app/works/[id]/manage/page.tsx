import { WorkManager } from '@/components/manage/work-manager'

export default async function ManageWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WorkManager workId={id} />
}
