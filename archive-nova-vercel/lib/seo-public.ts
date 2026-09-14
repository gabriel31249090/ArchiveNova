import { createClient } from '@supabase/supabase-js'

export type PublicWorkSeo = {
  id: string
  title: string
  summary: string
  language: string
  authorUsername: string
  authorName: string
  fandoms: string[]
  tags: string[]
  publishedAt: string | null
  updatedAt: string | null
}

export type PublicProfileSeo = {
  username: string
  displayName: string
  bio: string
  createdAt: string | null
}

function seoClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function cleanDescription(value: string, fallback: string, max = 160) {
  const text = (value || fallback).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export async function getPublicWorkSeo(id: string): Promise<PublicWorkSeo | null> {
  try {
    const supabase = seoClient()
    if (!supabase) return null
    const { data, error } = await supabase.rpc('get_work_detail', { target_work: id })
    if (error || !data) return null
    const raw = data as { work?: Record<string, unknown> }
    const work = raw.work || {}
    if (String(work.visibility || 'PUBLIC') !== 'PUBLIC') return null
    return {
      id: String(work.id || id),
      title: String(work.title || 'Obra no Archive Nova'),
      summary: String(work.summary || ''),
      language: String(work.language || 'pt-BR'),
      authorUsername: String(work.author_username || ''),
      authorName: String(work.author_display_name || work.author_username || 'Autor no Archive Nova'),
      fandoms: Array.isArray(work.fandoms) ? work.fandoms.map(String) : [],
      tags: Array.isArray(work.tags) ? work.tags.map(String) : [],
      publishedAt: work.published_at ? String(work.published_at) : null,
      updatedAt: work.updated_at ? String(work.updated_at) : null,
    }
  } catch {
    return null
  }
}

export async function getPublicProfileSeo(username: string): Promise<PublicProfileSeo | null> {
  try {
    const supabase = seoClient()
    if (!supabase) return null
    const { data, error } = await supabase.rpc('get_public_profile', { profile_username: decodeURIComponent(username) })
    if (error || !data) return null
    const payload = data as { profile?: Record<string, unknown> }
    const profile = payload.profile || {}
    if (!profile.username) return null
    return {
      username: String(profile.username),
      displayName: String(profile.display_name || profile.username),
      bio: String(profile.bio || ''),
      createdAt: profile.created_at ? String(profile.created_at) : null,
    }
  } catch {
    return null
  }
}

export async function getPublicWorkSitemapEntries() {
  try {
    const supabase = seoClient()
    if (!supabase) return [] as Array<{ id: string; updatedAt: string | null }>
    const { data, error } = await supabase
      .from('works')
      .select('id,updated_at')
      .eq('visibility', 'PUBLIC')
      .neq('status', 'DRAFT')
      .is('deleted_at', null)
      .not('published_at', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(5000)
    if (error) return []
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    }))
  } catch {
    return []
  }
}


export async function getPublicProfileSitemapEntries() {
  try {
    const supabase = seoClient()
    if (!supabase) return [] as Array<{ username: string; updatedAt: string | null }>
    const { data, error } = await supabase
      .from('profiles')
      .select('username,updated_at')
      .eq('status', 'ACTIVE')
      .order('updated_at', { ascending: false })
      .limit(5000)
    if (error) return []
    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      username: String(row.username),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    }))
  } catch {
    return []
  }
}


export async function getPublicTaxonomySitemapEntries() {
  try {
    const supabase = seoClient()
    if (!supabase) return [] as Array<{ kind:string; slug:string; updatedAt:string|null }>
    const { data, error } = await supabase.rpc('public_taxonomy_sitemap')
    if (error) return []
    return ((data || []) as Array<Record<string,unknown>>).map((row) => ({
      kind: String(row.kind || 'TAG'),
      slug: String(row.slug || ''),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    })).filter((row) => row.slug)
  } catch { return [] }
}

export async function getPublicListSitemapEntries() {
  try {
    const supabase = seoClient()
    if (!supabase) return [] as Array<{ kind:'series'|'collections'|'shelves'; id:string; updatedAt:string|null }>
    const [series, collections, shelves] = await Promise.all([
      supabase.from('series').select('id,updated_at').eq('visibility','PUBLIC').limit(3000),
      supabase.from('collections').select('id,updated_at').eq('visibility','PUBLIC').limit(3000),
      supabase.from('shelves').select('id,updated_at').eq('visibility','PUBLIC').limit(3000),
    ])
    const out:Array<{ kind:'series'|'collections'|'shelves'; id:string; updatedAt:string|null }> = []
    for (const row of (series.data || []) as Array<Record<string,unknown>>) out.push({kind:'series',id:String(row.id),updatedAt:row.updated_at?String(row.updated_at):null})
    for (const row of (collections.data || []) as Array<Record<string,unknown>>) out.push({kind:'collections',id:String(row.id),updatedAt:row.updated_at?String(row.updated_at):null})
    for (const row of (shelves.data || []) as Array<Record<string,unknown>>) out.push({kind:'shelves',id:String(row.id),updatedAt:row.updated_at?String(row.updated_at):null})
    return out
  } catch { return [] }
}


export type PublicTaxonomySeo = {
  id: string
  name: string
  slug: string
  description: string
  kind: string
  workCount: number
}

export async function getPublicTaxonomySeo(slug: string, kind: string): Promise<PublicTaxonomySeo | null> {
  try {
    const supabase = seoClient()
    if (!supabase) return null
    const { data, error } = await supabase.rpc('get_taxonomy_page', {
      target_slug: decodeURIComponent(slug),
      target_kind: kind,
    })
    if (error || !data) return null
    const payload = data as { taxonomy?: Record<string, unknown>; works?: Array<Record<string, unknown>> }
    const item = payload.taxonomy || {}
    if (!item.id) return null
    return {
      id: String(item.id),
      name: String(item.name || 'Índice'),
      slug: String(item.slug || slug),
      description: String(item.description || ''),
      kind: String(item.kind || kind),
      workCount: Array.isArray(payload.works) ? payload.works.length : 0,
    }
  } catch { return null }
}

export type PublicListSeo = {
  id: string
  title: string
  description: string
  ownerUsername: string
  ownerName: string
  kind: 'series' | 'collections' | 'shelves'
  workCount: number
}

export async function getPublicListSeo(id: string, kind: PublicListSeo['kind']): Promise<PublicListSeo | null> {
  try {
    const supabase = seoClient()
    if (!supabase) return null
    const rpc = kind === 'series' ? 'get_series' : kind === 'collections' ? 'get_collection' : 'get_shelf'
    const args = kind === 'series' ? { target_series: id } : kind === 'collections' ? { target_collection: id } : { target_shelf: id }
    const { data, error } = await supabase.rpc(rpc, args)
    if (error || !data) return null
    const payload = data as { series?: Record<string, unknown>; collection?: Record<string, unknown>; shelf?: Record<string, unknown>; works?: Array<Record<string, unknown>> }
    const item = payload.series || payload.collection || payload.shelf || {}
    if (!item.id) return null
    return {
      id: String(item.id),
      title: String(item.title || item.name || 'Lista'),
      description: String(item.summary || item.description || ''),
      ownerUsername: String(item.owner_username || ''),
      ownerName: String(item.owner_display_name || item.owner_username || ''),
      kind,
      workCount: Array.isArray(payload.works) ? payload.works.length : 0,
    }
  } catch { return null }
}
