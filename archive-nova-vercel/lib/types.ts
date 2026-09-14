export type ArchiveView = 'home' | 'explore' | 'library' | 'history'
export type AuthMode = 'login' | 'register'
export type LayoutMode = 'grid' | 'list'
export type SortMode = 'recent' | 'hot' | 'long'

export interface Profile {
  id: string
  username: string
  display_name: string | null
  bio?: string | null
  role?: 'USER' | 'MODERATOR' | 'ADMIN'
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
}

export interface PlatformStats {
  works: number
  fandoms: number
  users: number
  words: number
}

export interface FandomStat {
  id: string
  name: string
  slug: string
  work_count: number
  total_words: number
}

export interface WorkCardData {
  id: string
  creator_id: string
  title: string
  summary: string
  rating: 'GENERAL' | 'TEEN' | 'MATURE' | 'EXPLICIT' | 'NOT_RATED'
  status: 'ONGOING' | 'COMPLETE' | 'HIATUS' | 'DRAFT'
  visibility: 'PUBLIC' | 'REGISTERED' | 'UNLISTED' | 'PRIVATE'
  language: string
  expected_chapters: number | null
  word_count: number
  chapter_count: number
  kudos_count: number
  bookmarks_count: number
  comments_count: number
  hits_count: number
  allow_comments: boolean
  published_at: string | null
  updated_at: string
  created_at: string
  author_username: string
  author_display_name: string
  fandoms: string[]
  tags: string[]
  kudosed?: boolean
  bookmarked?: boolean
  subscribed?: boolean
  total_count?: number
}

export interface Chapter {
  id: string
  work_id: string
  chapter_number: number
  title: string | null
  content: string
  notes_before: string | null
  notes_after: string | null
  word_count: number
  status: 'DRAFT' | 'PUBLISHED'
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkDetail {
  work: WorkCardData
  chapters: Chapter[]
}

export interface CommentItem {
  id: string
  chapter_id: string
  user_id: string
  parent_id: string | null
  body: string
  status: 'VISIBLE' | 'HIDDEN' | 'DELETED'
  created_at: string
  updated_at: string
  profile?: {
    username: string
    display_name: string | null
  } | null
}

export interface WorkFilters {
  fandom: string
  rating: string
  status: string
  minWords: string
  includeTag: string
  excludeTag: string
  hideExplicit: boolean
}

export interface CreatorDashboardTotals {
  works: number
  published: number
  ongoing: number
  complete: number
  drafts: number
  words: number
  hits: number
  kudos: number
  bookmarks: number
  comments: number
  followers: number
  subscribers: number
  unread_notifications: number
}

export interface CreatorRecentComment {
  id: string
  body: string
  created_at: string
  chapter_id: string
  chapter_number: number
  chapter_title: string | null
  work_id: string
  work_title: string
  user_id: string
  username: string
  display_name: string
}

export interface NotificationItem {
  id: string
  type: 'KUDOS' | 'COMMENT' | 'COMMENT_REPLY' | 'NEW_FOLLOWER' | 'NEW_CHAPTER' | string
  actor_user_id: string | null
  work_id: string | null
  comment_id: string | null
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
  actor_username: string | null
  actor_display_name: string | null
  work_title: string | null
}

export interface ModerationReport {
  id: string
  reason: string
  details: string | null
  status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED'
  created_at: string
  resolved_at: string | null
  work_id: string | null
  comment_id: string | null
  reporter_username: string | null
  work_title: string | null
  comment_body: string | null
  comment_author_username: string | null
}
