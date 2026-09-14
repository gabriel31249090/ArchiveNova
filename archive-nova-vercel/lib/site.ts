const FALLBACK_SITE_URL = 'https://archive-nova-ewp5.vercel.app'

function normalizeSiteUrl(value: string) {
  return value.replace(/\/+$/, '')
}

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  const value = configured || (vercelProduction ? `https://${vercelProduction}` : FALLBACK_SITE_URL)
  return normalizeSiteUrl(value)
}

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getSiteUrl()}${normalizedPath}`
}
