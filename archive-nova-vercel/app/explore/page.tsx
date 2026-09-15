import type { Metadata } from 'next'
import { Suspense } from 'react'
import '../novadrop-v47.css'
import { ExploreEntry } from '@/components/explore/explore-entry'

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

export default function ExplorePage(){
  return <Suspense fallback={<main className="auth-route-loading"><span>✦</span><h1>Abrindo o arquivo…</h1></main>}><ExploreEntry/></Suspense>
}
