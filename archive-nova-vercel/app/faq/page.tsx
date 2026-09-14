import type { Metadata } from 'next'
import { FAQPage } from '@/components/faq/faq-page'

export const metadata: Metadata = {
  title: 'Perguntas frequentes',
  description: 'Tire dúvidas sobre conta, escrita, publicação, comunidade, apoio, colaboração e publicidade no Archive Nova.',
  alternates: { canonical: '/faq' },
}

export default function Page() {
  return <FAQPage />
}
