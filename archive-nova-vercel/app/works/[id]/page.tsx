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
      images: [{ url: absoluteUrl(`/api/og/work/${encodeURIComponent(work.id)}`), width: 1200, height: 630, alt: work.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: work.title,
      description,
      images: [absoluteUrl(`/api/og/work/${encodeURIComponent(work.id)}`)],
    },
    robots: { index: true, follow: true },
  }
}

export default async function WorkPage({ params }: WorkRouteProps) {
  const { id } = await params
  const work = await getPublicWorkSeo(id)

  const jsonLd = work ? {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CreativeWork',
        name: work.title,
        description: cleanDescription(work.summary, `Leia “${work.title}” no Archive Nova.`, 500),
        url: absoluteUrl(`/works/${encodeURIComponent(work.id)}`),
        image: absoluteUrl(`/api/og/work/${encodeURIComponent(work.id)}`),
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
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Archive Nova', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Explorar', item: absoluteUrl('/explore') },
          { '@type': 'ListItem', position: 3, name: work.title, item: absoluteUrl(`/works/${encodeURIComponent(work.id)}`) },
        ],
      },
    ],
  } : null

  return (
    <>
      {jsonLd ? <JsonLd value={jsonLd} /> : null}
      <PublicWorkPage workId={id} />
    </>
  )
}
