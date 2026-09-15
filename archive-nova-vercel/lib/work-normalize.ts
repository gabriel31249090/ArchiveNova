import type { WorkCardData } from '@/lib/types'

export function normalizeWorkCard(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''),
    creator_id: String(row.creator_id || ''),
    title: String(row.title || ''),
    summary: String(row.summary || ''),
    rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'],
    status: String(row.status || 'ONGOING') as WorkCardData['status'],
    visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'],
    language: String(row.language || 'pt-BR'),
    expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters),
    word_count: Number(row.word_count || 0),
    chapter_count: Number(row.chapter_count || 0),
    kudos_count: Number(row.kudos_count || 0),
    bookmarks_count: Number(row.bookmarks_count || 0),
    comments_count: Number(row.comments_count || 0),
    hits_count: Number(row.hits_count || 0),
    allow_comments: Boolean(row.allow_comments),
    published_at: row.published_at ? String(row.published_at) : null,
    updated_at: String(row.updated_at || ''),
    created_at: String(row.created_at || ''),
    author_username: String(row.author_username || ''),
    author_display_name: String(row.author_display_name || row.author_username || ''),
    fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [],
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    kudosed: Boolean(row.kudosed),
    bookmarked: Boolean(row.bookmarked),
    subscribed: Boolean(row.subscribed),
    total_count: row.total_count == null ? undefined : Number(row.total_count),
    allow_contributions: Boolean(row.allow_contributions),
    series: Array.isArray(row.series)
      ? row.series.map((item) => {
          const value = item as Record<string, unknown>
          return {
            id: String(value.id || ''),
            title: String(value.title || ''),
            position: Number(value.position || 0),
          }
        })
      : [],
  }
}
