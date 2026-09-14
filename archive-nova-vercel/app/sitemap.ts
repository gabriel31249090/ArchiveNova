import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'
import { getPublicListSitemapEntries, getPublicProfileSitemapEntries, getPublicTaxonomySitemapEntries, getPublicWorkSitemapEntries } from '@/lib/seo-public'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/explore'), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/feed'), changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/posts'), changeFrequency: 'daily', priority: 0.7 },
    { url: absoluteUrl('/faq'), changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/support'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/advertise'), changeFrequency: 'monthly', priority: 0.4 },
  ]
  const [works,profiles,taxonomies,lists]=await Promise.all([
    getPublicWorkSitemapEntries(),getPublicProfileSitemapEntries(),getPublicTaxonomySitemapEntries(),getPublicListSitemapEntries(),
  ])
  const workRoutes:MetadataRoute.Sitemap=works.map(work=>({url:absoluteUrl('/works/'+encodeURIComponent(work.id)),lastModified:work.updatedAt?new Date(work.updatedAt):undefined,changeFrequency:'weekly',priority:0.8}))
  const profileRoutes:MetadataRoute.Sitemap=profiles.map(profile=>({url:absoluteUrl('/users/'+encodeURIComponent(profile.username)),lastModified:profile.updatedAt?new Date(profile.updatedAt):undefined,changeFrequency:'weekly',priority:0.6}))
  const taxonomyRoutes:MetadataRoute.Sitemap=taxonomies.map(item=>{
    const base=item.kind==='FANDOM'?'fandoms':item.kind==='CHARACTER'?'characters':item.kind==='RELATIONSHIP'?'relationships':'tags'
    return {url:absoluteUrl('/'+base+'/'+encodeURIComponent(item.slug)),lastModified:item.updatedAt?new Date(item.updatedAt):undefined,changeFrequency:'weekly',priority:0.65}
  })
  const listRoutes:MetadataRoute.Sitemap=lists.map(item=>({url:absoluteUrl('/'+item.kind+'/'+encodeURIComponent(item.id)),lastModified:item.updatedAt?new Date(item.updatedAt):undefined,changeFrequency:'weekly',priority:0.55}))
  return [...staticRoutes,...workRoutes,...profileRoutes,...taxonomyRoutes,...listRoutes]
}
