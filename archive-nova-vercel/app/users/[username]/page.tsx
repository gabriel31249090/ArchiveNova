import type { Metadata } from 'next'
import { PublicProfilePage } from '@/components/profile/public-profile-page'
import { JsonLd } from '@/components/seo/json-ld'
import { absoluteUrl } from '@/lib/site'
import { cleanDescription, getPublicProfileSeo } from '@/lib/seo-public'
import '../../novadrop-v47-shared.css'

type UserRouteProps = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: UserRouteProps): Promise<Metadata> {
  const { username } = await params
  const profile = await getPublicProfileSeo(username)
  if (!profile) {
    return {
      title: 'Perfil indisponível',
      robots: { index: false, follow: false },
    }
  }

  const description = cleanDescription(
    profile.bio,
    `Leia as histórias de @${profile.username} no Archive Nova.`,
  )

  return {
    title: `${profile.displayName} (@${profile.username})`,
    description,
    alternates: { canonical: `/users/${encodeURIComponent(profile.username)}` },
    openGraph: {
      type: 'profile',
      title: `${profile.displayName} (@${profile.username})`,
      description,
      url: `/users/${encodeURIComponent(profile.username)}`,
      siteName: 'Archive Nova',
      locale: 'pt_BR',
    },
    twitter: {
      card: 'summary',
      title: `${profile.displayName} (@${profile.username})`,
      description,
    },
    robots: { index: true, follow: true },
  }
}

export default async function UserProfilePage({ params }: UserRouteProps) {
  const { username } = await params
  const profile = await getPublicProfileSeo(username)

  const jsonLd = profile ? {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.displayName,
    alternateName: `@${profile.username}`,
    description: cleanDescription(profile.bio, `Autor no Archive Nova.`, 500),
    url: absoluteUrl(`/users/${encodeURIComponent(profile.username)}`),
    memberOf: {
      '@type': 'Organization',
      name: 'Archive Nova',
      url: absoluteUrl('/'),
    },
  } : null

  return (
    <>
      {jsonLd ? <JsonLd value={jsonLd} /> : null}
      <PublicProfilePage username={username} />
    </>
  )
}
