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
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'MARK', 'SPAN',
  'SUP', 'SUB', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR',
  'CODE', 'PRE', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'COLGROUP', 'COL', 'DIV',
])

const DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'VIDEO',
  'AUDIO', 'SOURCE', 'FORM', 'INPUT', 'BUTTON', 'META', 'LINK', 'BASE',
])

function safeColor(value: string) {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) || /^rgba?\([\d\s.,%]+\)$/i.test(value)
}

function sanitizeStyle(element: HTMLElement) {
  const source = element.style
  const safe: string[] = []

  if (/^(left|center|right|justify)$/i.test(source.textAlign)) safe.push(`text-align:${source.textAlign.toLowerCase()}`)
  if (/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i.test(source.textIndent)) safe.push(`text-indent:${source.textIndent}`)

  const size = source.fontSize.match(/^(\d+(?:\.\d+)?)px$/i)
  if (size) {
    const clamped = Math.min(48, Math.max(12, Number(size[1])))
    safe.push(`font-size:${clamped}px`)
  }

  const lineHeight = Number(source.lineHeight)
  if (Number.isFinite(lineHeight) && lineHeight >= 1 && lineHeight <= 2.2) safe.push(`line-height:${lineHeight}`)

  if (source.fontFamily && /^[\w\s,"'\-]+$/.test(source.fontFamily)) safe.push(`font-family:${source.fontFamily}`)
  if (source.color && safeColor(source.color)) safe.push(`color:${source.color}`)
  if (source.backgroundColor && safeColor(source.backgroundColor)) safe.push(`background-color:${source.backgroundColor}`)

  if (safe.length) element.setAttribute('style', safe.join(';'))
  else element.removeAttribute('style')
}

function safeHref(value: string) {
  try {
    const url = new URL(value, window.location.origin)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
  } catch {
    return false
  }
}

export function sanitizeStoryHtml(value: string) {
  if (!value) return '<p></p>'
  if (typeof window === 'undefined') return value

  const doc = new DOMParser().parseFromString(value, 'text/html')

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

      const tag = element.tagName
      const href = tag === 'A' ? element.getAttribute('href') : null
      const pageBreak = tag === 'DIV' && element.getAttribute('data-page-break') === 'true'
      const cellSpan = tag === 'TD' || tag === 'TH'
        ? {
            colspan: element.getAttribute('colspan'),
            rowspan: element.getAttribute('rowspan'),
          }
        : null

      sanitizeStyle(element)
      const style = element.getAttribute('style')
      Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name))
      if (style) element.setAttribute('style', style)

      if (tag === 'A' && href && safeHref(href)) {
        element.setAttribute('href', href)
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noopener noreferrer nofollow')
      }

      if (pageBreak) {
        element.setAttribute('data-page-break', 'true')
        element.setAttribute('class', 'an-page-break')
      }

      if (cellSpan?.colspan && /^\d+$/.test(cellSpan.colspan)) element.setAttribute('colspan', cellSpan.colspan)
      if (cellSpan?.rowspan && /^\d+$/.test(cellSpan.rowspan)) element.setAttribute('rowspan', cellSpan.rowspan)
    })
  }

  walk(doc.body)
  return doc.body.innerHTML || '<p></p>'
}
