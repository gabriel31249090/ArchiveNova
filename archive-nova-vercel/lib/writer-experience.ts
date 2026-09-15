export type WriterChapterStage = 'IDEA' | 'DRAFT' | 'REVISION' | 'READY'
export type WriterAssetKind = 'CHARACTER' | 'LOCATION' | 'TIMELINE' | 'NOTE' | 'SNIPPET'

export type WriterAsset = {
  id: string
  draft_id: string
  user_id: string
  kind: WriterAssetKind
  title: string
  body: string
  metadata: Record<string, unknown>
  sort_order: number
  created_at: string
  updated_at: string
}

export type WriterAnnotation = {
  id: string
  draft_id: string
  chapter_id: string | null
  user_id: string
  anchor_text: string | null
  body: string
  resolved: boolean
  created_at: string
  updated_at: string
}

export type WriterDraftVersion = {
  id: string
  draft_id: string
  chapter_id: string
  user_id: string
  revision: number
  title: string | null
  content_html: string
  content_json: Record<string, unknown>
  word_count: number
  source: 'AUTO' | 'MANUAL' | 'RESTORE' | 'IMPORT'
  created_at: string
}

export type WriterActivity = {
  user_id: string
  draft_id: string
  activity_date: string
  words_added: number
  saves: number
  updated_at: string
}

export type WriterBetaInvite = {
  id: string
  draft_id: string
  owner_id: string
  reader_id: string | null
  token: string
  label: string | null
  status: 'ACTIVE' | 'REVOKED'
  expires_at: string
  created_at: string
}

export type WriterBetaFeedback = {
  id: string
  invite_id: string
  draft_id: string
  chapter_id: string | null
  reader_id: string
  anchor_text: string | null
  body: string
  created_at: string
}

export type WriterWorkspaceState = {
  assets: WriterAsset[]
  annotations: WriterAnnotation[]
  versions: WriterDraftVersion[]
  activity: WriterActivity[]
  beta_invites: WriterBetaInvite[]
  beta_feedback: WriterBetaFeedback[]
}

export function stageLabel(stage: WriterChapterStage | string) {
  if (stage === 'IDEA') return 'Ideia'
  if (stage === 'REVISION') return 'Revisão'
  if (stage === 'READY') return 'Pronto'
  return 'Rascunho'
}

export function assetLabel(kind: WriterAssetKind | string) {
  if (kind === 'CHARACTER') return 'Personagem'
  if (kind === 'LOCATION') return 'Lugar'
  if (kind === 'TIMELINE') return 'Linha do tempo'
  if (kind === 'SNIPPET') return 'Snippet'
  return 'Nota'
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function writerStreak(activity: WriterActivity[]) {
  const dates = new Set(activity.filter((row) => Number(row.words_added || 0) > 0).map((row) => row.activity_date))
  let streak = 0
  const cursor = new Date()
  for (let i = 0; i < 366; i += 1) {
    const key = localDateKey(cursor)
    if (!dates.has(key)) {
      if (i === 0) {
        cursor.setDate(cursor.getDate() - 1)
        continue
      }
      break
    }
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function stripWriterHtml(html: string) {
  if (typeof window === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || '').replace(/\s+/g, ' ').trim()
}
