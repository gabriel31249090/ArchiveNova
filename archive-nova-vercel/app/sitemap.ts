import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'
import { getPublicWorkSitemapEntries } from '@/lib/seo-public'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/explore'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/posts'), lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: absoluteUrl('/faq'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/support'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/advertise'), lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ]

  const works = await getPublicWorkSitemapEntries()
  const workRoutes: MetadataRoute.Sitemap = works.map((work) => ({
    url: absoluteUrl(`/works/${encodeURIComponent(work.id)}`),
    lastModified: work.updatedAt ? new Date(work.updatedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...workRoutes]
}
