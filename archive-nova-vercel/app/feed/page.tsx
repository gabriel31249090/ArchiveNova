import type { Metadata } from 'next'
import { DiscoveryFeed } from '@/components/feed/discovery-feed'

export const metadata: Metadata = {
  title: 'Seu feed',
  description: 'Recomendações transparentes de histórias no Archive Nova.',
  robots: { index: false, follow: true },
}

export default function FeedPage() {
  return <DiscoveryFeed />
}
