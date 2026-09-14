import type { Metadata } from 'next'
import { AdvertisePage } from '@/components/ads/advertise-page'

export const metadata: Metadata = {
  title: 'Publicidade',
  description: 'Conheça a publicidade identificada e integrada ao Archive Nova, sem alterar organicamente o ranking das histórias.',
  alternates: { canonical: '/advertise' },
}

export default function Page() {
  return <AdvertisePage />
}
