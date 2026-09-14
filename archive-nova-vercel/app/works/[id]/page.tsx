import type { Metadata } from 'next'
import { PublicWorkPage } from '@/components/reader/public-work-page'
import { JsonLd } from '@/components/seo/json-ld'
import { absoluteUrl } from '@/lib/site'
import { cleanDescription, getPublicWorkSeo } from '@/lib/seo-public'

type WorkRouteProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: WorkRouteProps): Promise<Metadata> {
  const { id } = await params
  const work = await getPublicWorkSeo(id)
  if (!work) {
    return {
      title: 'Obra indisponível',
      description: 'Esta obra não está disponível publicamente no Archive Nova.',
      robots: { index: false, follow: false },
    }
  }

  const description = cleanDescription(
    work.summary,
    `Leia “${work.title}”, de ${work.authorName}, no Archive Nova.`,
  )

  return {
    title: work.title,
    description,
    keywords: [...work.fandoms, ...work.tags, 'fanfic', 'história'],
    alternates: { canonical: `/works/${encodeURIComponent(work.id)}` },
    openGraph: {
      type: 'article',
      title: work.title,
      description,
      url: `/works/${encodeURIComponent(work.id)}`,
      siteName: 'Archive Nova',
      locale: work.language.replace('-', '_'),
      publishedTime: work.publishedAt || undefined,
      modifiedTime: work.updatedAt || undefined,
      authors: work.authorUsername ? [absoluteUrl(`/users/${encodeURIComponent(work.authorUsername)}`)] : undefined,
    },
    twitter: {
      card: 'summary',
      title: work.title,
      description,
    },
    robots: { index: true, follow: true },
  }
}

export default async function WorkPage({ params }: WorkRouteProps) {
  const { id } = await params
  const work = await getPublicWorkSeo(id)

  const jsonLd = work ? {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: work.title,
    description: cleanDescription(work.summary, `Leia “${work.title}” no Archive Nova.`, 500),
    url: absoluteUrl(`/works/${encodeURIComponent(work.id)}`),
    inLanguage: work.language,
    datePublished: work.publishedAt || undefined,
    dateModified: work.updatedAt || undefined,
    keywords: [...work.fandoms, ...work.tags].join(', '),
    author: {
      '@type': 'Person',
      name: work.authorName,
      url: work.authorUsername ? absoluteUrl(`/users/${encodeURIComponent(work.authorUsername)}`) : undefined,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Archive Nova',
      url: absoluteUrl('/'),
    },
  } : null

  return (
    <>
      {jsonLd ? <JsonLd value={jsonLd} /> : null}
      <PublicWorkPage workId={id} />
    </>
  )
}
