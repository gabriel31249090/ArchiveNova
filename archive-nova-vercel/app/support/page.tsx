import type { Metadata } from 'next'
import { SupportPage } from '@/components/support/support-page'

export const metadata: Metadata = {
  title: 'Apoiar o Archive Nova',
  description: 'Veja formas de apoiar diretamente o Archive Nova e sua comunidade de leitores e escritores.',
  alternates: { canonical: '/support' },
}

export default function Page() {
  return <SupportPage />
}
