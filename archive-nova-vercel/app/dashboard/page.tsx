import type { Metadata } from 'next'
import { CreatorDashboard } from '@/components/dashboard/creator-dashboard'
export const metadata: Metadata = { title: 'Creator Studio', robots: { index: false, follow: false } }
export default function DashboardPage() { return <CreatorDashboard /> }
