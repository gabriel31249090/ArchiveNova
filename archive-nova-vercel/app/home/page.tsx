import type { Metadata } from 'next'
import { PersonalizedHome } from '@/components/home/personalized-home'

export const metadata: Metadata = {
  title: 'Início',
  description: 'Sua página inicial personalizada no Archive Nova.',
  robots: { index: false, follow: true },
}

export default function HomePage() {
  return <PersonalizedHome />
}
