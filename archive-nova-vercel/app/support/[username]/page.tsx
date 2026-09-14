import type { Metadata } from 'next'
import { SupportPage } from '@/components/support/support-page'
export const metadata: Metadata = { title: 'Apoiar autor', robots: { index: false, follow: true } }
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return <SupportPage username={username} />
}
