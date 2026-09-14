import type { Metadata } from 'next'
import { PostsFeed } from '@/components/community/posts-feed'

export const metadata: Metadata = {
  title: 'Posts da comunidade',
  description: 'Acompanhe atualizações, enquetes e conversas entre leitores e escritores no Archive Nova.',
  alternates: { canonical: '/posts' },
}

export default function PostsPage() {
  return <PostsFeed />
}
