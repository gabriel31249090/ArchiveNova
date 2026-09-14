import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import './community-v4.css'
import './design-system.css'

export const metadata: Metadata = {
  title: {
    default: 'Archive Nova — Histórias sem algoritmo',
    template: '%s | Archive Nova',
  },
  description: 'Leia, escreva, publique e colabore em um arquivo comunitário com busca detalhada, Writer Cloud, posts, feed transparente e ferramentas para autores.',
  keywords: ['fanfic', 'histórias', 'arquivo', 'escrita', 'fandom', 'Archive Nova'],
  openGraph: {
    title: 'Archive Nova — Histórias sem algoritmo',
    description: 'Um arquivo comunitário para ler, escrever, publicar e colaborar em histórias.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
