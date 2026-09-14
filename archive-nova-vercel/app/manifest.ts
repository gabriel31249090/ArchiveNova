import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Archive Nova',
    short_name: 'Archive Nova',
    description: 'Leia, escreva, publique e colabore em um arquivo comunitário de histórias.',
    start_url: '/',
    display: 'standalone',
    background_color: '#131114',
    theme_color: '#8d1d35',
    lang: 'pt-BR',
    categories: ['books', 'entertainment', 'social'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
