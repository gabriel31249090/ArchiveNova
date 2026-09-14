import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { JsonLd } from '@/components/seo/json-ld'
import { absoluteUrl, getSiteUrl } from '@/lib/site'
import './globals.css'
import './community-v4.css'
import './design-system.css'

const siteUrl = getSiteUrl()
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Archive Nova',
  title: {
    default: 'Archive Nova — Histórias sem algoritmo',
    template: '%s | Archive Nova',
  },
  description: 'Leia, escreva, publique e colabore em um arquivo comunitário com busca detalhada, Writer Cloud, posts, feed transparente e ferramentas para autores.',
  keywords: ['fanfic', 'fanfics', 'histórias', 'arquivo', 'escrita', 'fandom', 'leitura', 'Archive Nova'],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Archive Nova — Histórias sem algoritmo',
    description: 'Um arquivo comunitário para ler, escrever, publicar e colaborar em histórias.',
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Archive Nova',
    url: '/',
  },
  twitter: {
    card: 'summary',
    title: 'Archive Nova — Histórias sem algoritmo',
    description: 'Um arquivo comunitário para ler, escrever, publicar e colaborar em histórias.',
  },
  icons: {
    icon: '/icon.svg',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: googleVerification ? { google: googleVerification } : undefined,
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Archive Nova',
    alternateName: 'ArchiveNova',
    url: absoluteUrl('/'),
    description: 'Arquivo comunitário para ler, escrever, publicar e colaborar em histórias.',
    inLanguage: 'pt-BR',
  }

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <JsonLd value={websiteJsonLd} />
        {children}
      </body>
    </html>
  )
}
