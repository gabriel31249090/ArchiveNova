import { NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import sanitizeHtml from 'sanitize-html'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 20 * 1024 * 1024

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function plainTextToHtml(value: string) {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return '<p></p>'

  return normalized
    .split(/\n{2,}/u)
    .map((block) => `<p>${escapeHtml(block).replaceAll('\n', '<br>')}</p>`)
    .join('')
}

function markdownToHtml(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (listType) output.push(`</${listType}>`)
    listType = null
  }

  const inline = (text: string) => escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      closeList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    const quote = line.match(/^>\s?(.+)$/)
    if (quote) {
      closeList()
      output.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`)
      continue
    }

    const bullet = line.match(/^[-*+]\s+(.+)$/)
    if (bullet) {
      if (listType !== 'ul') {
        closeList()
        listType = 'ul'
        output.push('<ul>')
      }
      output.push(`<li>${inline(bullet[1])}</li>`)
      continue
    }

    const numbered = line.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      if (listType !== 'ol') {
        closeList()
        listType = 'ol'
        output.push('<ol>')
      }
      output.push(`<li>${inline(numbered[1])}</li>`)
      continue
    }

    if (/^([-*_])\1\1+$/.test(line.trim())) {
      closeList()
      output.push('<hr>')
      continue
    }

    closeList()
    output.push(`<p>${inline(line)}</p>`)
  }

  closeList()
  return output.join('') || '<p></p>'
}

function rtfToText(value: string) {
  return value
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\'([0-9a-fA-F]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u(-?\d+)\??/g, (_match, code: string) => {
      const valueCode = Number(code)
      return String.fromCharCode(valueCode < 0 ? valueCode + 65536 : valueCode)
    })
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sanitizeImportedHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'mark', 'span',
      'sup', 'sub', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr',
      'code', 'pre', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      div: ['data-page-break', 'class'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      span: ['style'],
      mark: ['style', 'data-color'],
      table: ['class'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
        'text-indent': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
        'font-family': [/^[\w\s,"'\-]+$/],
        'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
        'line-height': [/^\d+(?:\.\d+)?$/],
        color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([^)]+\)$/],
        'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([^)]+\)$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer nofollow',
        },
      }),
    },
  }) || '<p></p>'
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-3]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function detectTitle(html: string, fallbackName: string) {
  const heading = html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1]
  const headingText = heading ? stripHtml(heading) : ''
  if (headingText) return headingText.slice(0, 180)
  return fallbackName.replace(/\.[^.]+$/u, '').replace(/[_-]+/g, ' ').trim().slice(0, 180)
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nenhum arquivo foi enviado.' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'O arquivo excede o limite de 20 MB.' }, { status: 413 })
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    const bytes = await file.arrayBuffer()
    const warnings: string[] = []
    let html = '<p></p>'

    if (extension === 'docx') {
      const result = await mammoth.convertToHtml(
        { buffer: Buffer.from(bytes) },
        {
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Subtitle'] => h2:fresh",
          ],
        },
      )
      html = result.value
      warnings.push(...result.messages.map((message) => message.message).filter(Boolean))
    } else if (extension === 'pdf') {
      const parser = new PDFParse({ data: Buffer.from(bytes) })
      try {
        const result = await parser.getText()
        html = plainTextToHtml(result.text || '')
        warnings.push('PDFs são importados principalmente como texto; formatações visuais complexas podem não ser preservadas.')
      } finally {
        await parser.destroy()
      }
    } else if (extension === 'txt') {
      html = plainTextToHtml(new TextDecoder().decode(bytes))
    } else if (extension === 'md' || extension === 'markdown') {
      html = markdownToHtml(new TextDecoder().decode(bytes))
    } else if (extension === 'html' || extension === 'htm') {
      html = new TextDecoder().decode(bytes)
    } else if (extension === 'rtf') {
      const text = rtfToText(Buffer.from(bytes).toString('latin1'))
      html = plainTextToHtml(text)
      warnings.push('RTF é importado como texto limpo; parte da formatação pode ser simplificada.')
    } else if (extension === 'doc') {
      return NextResponse.json({
        error: 'O formato .DOC antigo não pode ser convertido com segurança no navegador. Abra o arquivo no Word/LibreOffice e salve como .DOCX.',
      }, { status: 415 })
    } else {
      return NextResponse.json({ error: 'Formato não suportado. Use DOCX, PDF, TXT, Markdown, HTML ou RTF.' }, { status: 415 })
    }

    const sanitized = sanitizeImportedHtml(html)
    const text = stripHtml(sanitized)
    const words = text ? text.split(/\s+/u).filter(Boolean).length : 0

    return NextResponse.json({
      name: file.name,
      title: detectTitle(sanitized, file.name),
      html: sanitized,
      preview: text.slice(0, 1600),
      words,
      characters: text.length,
      warnings: warnings.slice(0, 6),
    })
  } catch (error) {
    console.error('Falha ao importar documento:', error)
    return NextResponse.json({ error: 'Não foi possível processar esse documento.' }, { status: 500 })
  }
}
