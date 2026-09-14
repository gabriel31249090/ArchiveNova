import type { Metadata } from 'next'
import { MyWorksDashboard } from '@/components/manage/my-works-dashboard'
export const metadata: Metadata = { title: 'Minhas obras', robots: { index: false, follow: false } }
export default function MyWorksPage() { return <MyWorksDashboard /> }
