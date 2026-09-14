import type { Metadata } from 'next'
import { AdminCenter } from '@/components/admin/admin-center'

export const metadata: Metadata = {
  title: 'Admin Center',
  robots: { index: false, follow: false },
}

type AdminRouteProps = {
  params: Promise<{ section?: string[] }>
}

export default async function AdminPage({ params }: AdminRouteProps) {
  const { section } = await params
  return <AdminCenter section={section?.[0] || 'overview'} />
}
