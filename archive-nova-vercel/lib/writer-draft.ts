export const DRAFT_STORAGE_KEY = 'archive-nova:writer:draft:v1'

export type LocalWriterDraft = {
  version: 1
  title: string
  chapterTitle: string
  content: string
  updatedAt: string
}

export function readLocalWriterDraft(): LocalWriterDraft | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocalWriterDraft>
    if (parsed.version !== 1) return null

    return {
      version: 1,
      title: typeof parsed.title === 'string' ? parsed.title : '',
      chapterTitle: typeof parsed.chapterTitle === 'string' ? parsed.chapterTitle : '',
      content: typeof parsed.content === 'string' ? parsed.content : '<p></p>',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function clearLocalWriterDraft() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_STORAGE_KEY)
}

export function htmlToPlainText(value: string) {
  if (!value) return ''
  if (typeof window === 'undefined') return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  const doc = new DOMParser().parseFromString(value, 'text/html')
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
}

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE',
  'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'CODE', 'PRE',
])

export function sanitizeStoryHtml(value: string) {
  if (!value) return '<p></p>'
  if (typeof window === 'undefined') return value

  const doc = new DOMParser().parseFromString(value, 'text/html')
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'FORM', 'INPUT', 'BUTTON'])
  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const element = child as HTMLElement

      if (DROP_TAGS.has(element.tagName)) {
        element.remove()
        return
      }

      walk(element)

      if (!ALLOWED_TAGS.has(element.tagName)) {
        const parent = element.parentNode
        if (parent) {
          while (element.firstChild) parent.insertBefore(element.firstChild, element)
          parent.removeChild(element)
        }
        return
      }

      Array.from(element.attributes).forEach((attribute) => {
        if (attribute.name === 'style') {
          const match = attribute.value.match(/text-align\s*:\s*(left|center|right|justify)/i)
          if (match) element.setAttribute('style', `text-align:${match[1].toLowerCase()}`)
          else element.removeAttribute('style')
        } else {
          element.removeAttribute(attribute.name)
        }
      })
    })
  }

  walk(doc.body)
  return doc.body.innerHTML || '<p></p>'
}
