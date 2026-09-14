import type { Metadata } from 'next'
import { ArchiveNovaApp } from '@/components/archive-nova-app'

export const metadata: Metadata = {
  title: 'Explorar histórias',
  description: 'Descubra fanfics e histórias por fandom, tags, classificação, status e tamanho no Archive Nova.',
  alternates: { canonical: '/explore' },
  openGraph: {
    title: 'Explorar histórias | Archive Nova',
    description: 'Descubra fanfics e histórias por fandom, tags e filtros transparentes.',
    url: '/explore',
  },
}

export default function ExplorePage() {
  return <ArchiveNovaApp initialView="explore" />
}
