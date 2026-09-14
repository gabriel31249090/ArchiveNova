import { PublicWorkPage } from '@/components/reader/public-work-page'

export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PublicWorkPage workId={id} />
}
