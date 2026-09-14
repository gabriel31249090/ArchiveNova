import type { Metadata } from 'next'
import { ArchiveNovaApp } from '@/components/archive-nova-app'

export const metadata: Metadata = {
  title: 'Início',
  description: 'Sua página inicial dentro do Archive Nova.',
  robots: { index: false, follow: true },
}

export default function HomePage() {
  return <ArchiveNovaApp initialView="home" />
}
