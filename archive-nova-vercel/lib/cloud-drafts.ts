import type { WriterChapterStage } from '@/lib/writer-experience'

export type CloudDraftChapter = {
  id: string
  title: string
  content_html: string
  content_json: Record<string, unknown>
  word_count: number
  position: number
  revision: number
  updated_at: string
  stage?: WriterChapterStage
  synopsis?: string
  pov?: string
  target_words?: number | null
  scheduled_for?: string | null
}

export type CloudDraft = {
  id: string
  title: string
  revision: number
  created_at: string
  updated_at: string
  daily_word_goal?: number
  weekly_word_goal?: number
  project_word_goal?: number | null
  publish_scheduled_for?: string | null
  chapters: CloudDraftChapter[]
}

export type CloudDraftListItem = {
  id: string
  title: string
  revision: number
  created_at: string
  updated_at: string
  chapter_count: number
  word_count: number
  first_chapter_title: string
  daily_word_goal?: number
  weekly_word_goal?: number
  project_word_goal?: number | null
  today_words?: number
  week_words?: number
}

export type DraftMirror = {
  version: 1
  draftId: string
  chapterId: string
  title: string
  chapterTitle: string
  content: string
  updatedAt: string
  pendingSync: boolean
}

export function cloudMirrorKey(draftId: string) { return `archive-nova:writer:cloud:${draftId}:v1` }

export function readCloudMirror(draftId: string): DraftMirror | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(cloudMirrorKey(draftId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DraftMirror>
    if (parsed.version !== 1 || parsed.draftId !== draftId || !parsed.chapterId) return null
    return { version: 1, draftId, chapterId: String(parsed.chapterId), title: typeof parsed.title === 'string' ? parsed.title : '', chapterTitle: typeof parsed.chapterTitle === 'string' ? parsed.chapterTitle : '', content: typeof parsed.content === 'string' ? parsed.content : '<p></p>', updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(), pendingSync: Boolean(parsed.pendingSync) }
  } catch { return null }
}

export function writeCloudMirror(value: DraftMirror) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(cloudMirrorKey(value.draftId), JSON.stringify(value)) } catch { /* storage may be unavailable */ }
}

export function clearCloudMirror(draftId: string) { if (typeof window !== 'undefined') window.localStorage.removeItem(cloudMirrorKey(draftId)) }
