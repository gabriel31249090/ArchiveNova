import type { Metadata } from 'next'
import { LibraryPage } from '@/components/library/library-page'

export const metadata: Metadata = {
  title: 'Minha biblioteca',
  robots: { index:false, follow:false },
}

export default function Page() {
  return <LibraryPage />
}
