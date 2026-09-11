import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Archive Nova — Histórias sem algoritmo',
  description: 'Leia, escreva e arquive histórias com busca detalhada, fandoms, tags e uma biblioteca feita para leitores e escritores.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
