import type { Metadata } from 'next'
import { SupportSettings } from '@/components/support/support-settings'
export const metadata: Metadata = { title: 'Configurações de apoio', robots: { index: false, follow: false } }
export default function Page() { return <SupportSettings /> }
