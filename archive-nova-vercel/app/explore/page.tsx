import type { Metadata } from 'next'
import '../novadrop-v47.css'
import { ArchiveNovaApp } from '@/components/archive-nova-app'
import { ExploreV47 } from '@/components/explore/explore-v47'

export const metadata: Metadata = {
  title: 'Explorar histórias',
  description: 'Descubra fanfics e histórias por obra, autor, fandom, tags, classificação, status e tamanho no Archive Nova.',
  alternates: { canonical: '/explore' },
  openGraph: {
    title: 'Explorar histórias | Archive Nova',
    description: 'Busca avançada, sugestões instantâneas e filtros transparentes para encontrar sua próxima leitura.',
    url: '/explore',
  },
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  if (params.auth === 'login' || params.auth === 'register') {
    return <ArchiveNovaApp initialView="explore" />
  }
  return <ExploreV47 />
}
