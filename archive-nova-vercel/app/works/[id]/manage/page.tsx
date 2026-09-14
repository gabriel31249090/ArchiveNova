import type { Metadata } from 'next'
import { WorkManager } from '@/components/manage/work-manager'
export const metadata: Metadata = { title: 'Gerenciar obra', robots: { index: false, follow: false } }
export default async function ManageWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WorkManager workId={id} />
}
