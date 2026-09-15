import type { MetadataRoute } from 'next'
import { absoluteUrl, getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/auth',
        '/dashboard',
        '/moderation',
        '/notifications',
        '/publish',
        '/settings',
        '/write',
      ],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: getSiteUrl(),
  }
}
