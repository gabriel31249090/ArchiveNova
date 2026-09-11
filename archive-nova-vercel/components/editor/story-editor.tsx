'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'

type TiptapEditor = NonNullable<ReturnType<typeof useEditor>>

const DRAFT_STORAGE_KEY = 'archive-nova:writer:draft:v1'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type LocalDraft = {
  version: 1
  title: string
  chapterTitle: string
  content: string
  updatedAt: string
}

function countWords(text: string) {
  const cleaned = text.trim()
  return cleaned ? cleaned.split(/\s+/u).length : 0
}

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

function formatSavedAt(date: Date | null) {
  if (!date) return 'Ainda não salvo'
  return `Salvo às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  title,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      className={`writer-tool-button ${active ? 'active' : ''}`}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function EditorToolbar({ editor }: { editor: TiptapEditor | null }) {
  if (!editor) {
    return <div className="writer-toolbar-skeleton" aria-hidden="true" />
  }

  return (
    <div className="writer-toolbar" role="toolbar" aria-label="Ferramentas de formatação">
      <div className="writer-tool-group">
        <ToolbarButton label="↶" title="Desfazer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton label="↷" title="Refazer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group">
        <ToolbarButton label="B" title="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="I" title="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="U" title="Sublinhado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolbarButton label="S" title="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group">
        <ToolbarButton label="P" title="Parágrafo" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} />
        <ToolbarButton label="H1" title="Título 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton label="H2" title="Título 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group">
        <ToolbarButton label="•" title="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton label="1." title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton label="❝" title="Citação" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton label="—" title="Separador" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group">
        <ToolbarButton label="≡" title="Alinhar à esquerda" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <ToolbarButton label="≣" title="Centralizar" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <ToolbarButton label="☷" title="Alinhar à direita" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group">
        <ToolbarButton label="Tx" title="Limpar formatação" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} />
      </div>
    </div>
  )
}

export function StoryEditor() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [contentHtml, setContentHtml] = useState('<p></p>')
  const [wordCount, setWordCount] = useState(0)
  const [characterCount, setCharacterCount] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [notice, setNotice] = useState('')

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: 'Comece a escrever sua história…',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    [],
  )

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'story-editor-content',
        spellcheck: 'true',
        'aria-label': 'Texto do capítulo',
      },
    },
    onUpdate: ({ editor: currentEditor }: { editor: TiptapEditor }) => {
      const text = currentEditor.getText()
      setContentHtml(currentEditor.getHTML())
      setWordCount(countWords(text))
      setCharacterCount(text.length)
    },
  })

  const saveDraftImmediately = useCallback(() => {
    if (!hydratedDraft) return

    try {
      const draft: LocalDraft = {
        version: 1,
        title,
        chapterTitle,
        content: contentHtml,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
      const savedAt = new Date(draft.updatedAt)
      setLastSaved(savedAt)
      setSaveState('saved')
    } catch (error) {
      console.error('Falha ao salvar o rascunho local:', error)
      setSaveState('error')
    }
  }, [chapterTitle, contentHtml, hydratedDraft, title])

  useEffect(() => {
    if (!editor || hydratedDraft) return

    try {
      const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as Partial<LocalDraft>
        const savedContent = typeof draft.content === 'string' ? draft.content : '<p></p>'
        const savedTitle = typeof draft.title === 'string' ? draft.title : ''
        const savedChapterTitle = typeof draft.chapterTitle === 'string' ? draft.chapterTitle : ''

        setTitle(savedTitle)
        setChapterTitle(savedChapterTitle)
        setContentHtml(savedContent)
        editor.commands.setContent(savedContent, { emitUpdate: false })
        const text = editor.getText()
        setWordCount(countWords(text))
        setCharacterCount(text.length)

        if (typeof draft.updatedAt === 'string') {
          const parsedDate = new Date(draft.updatedAt)
          if (!Number.isNaN(parsedDate.getTime())) setLastSaved(parsedDate)
        }
      }
    } catch (error) {
      console.error('Falha ao restaurar o rascunho local:', error)
    } finally {
      setHydratedDraft(true)
      setSaveState('saved')
    }
  }, [editor, hydratedDraft])

  useEffect(() => {
    if (!hydratedDraft) return

    setSaveState('saving')
    const timer = window.setTimeout(saveDraftImmediately, 700)
    return () => window.clearTimeout(timer)
  }, [chapterTitle, contentHtml, hydratedDraft, saveDraftImmediately, title])

  useEffect(() => {
    const saveBeforeLeave = () => saveDraftImmediately()
    window.addEventListener('beforeunload', saveBeforeLeave)
    return () => window.removeEventListener('beforeunload', saveBeforeLeave)
  }, [saveDraftImmediately])

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch (error) {
      console.error('Não foi possível alternar a tela cheia:', error)
    }
  }

  function createNewDraft() {
    const hasContent = Boolean(title.trim() || chapterTitle.trim() || editor?.getText().trim())
    if (hasContent && !window.confirm('Criar um novo rascunho? O rascunho atual será apagado deste navegador.')) return

    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setTitle('')
    setChapterTitle('')
    setContentHtml('<p></p>')
    setWordCount(0)
    setCharacterCount(0)
    setLastSaved(null)
    editor?.commands.setContent('<p></p>', { emitUpdate: false })
    setSaveState('saved')
    setNotice('Novo rascunho criado.')
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editor) return

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['txt', 'md', 'html', 'htm'].includes(extension || '')) {
      setNotice('Nesta fase, importe TXT, Markdown ou HTML. DOCX e PDF entram na próxima etapa.')
      return
    }

    try {
      const raw = await file.text()
      const importedContent = extension === 'html' || extension === 'htm' ? raw : plainTextToHtml(raw)
      editor.commands.setContent(importedContent)
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/u, ''))
      setNotice(`${file.name} importado para o editor.`)
    } catch (error) {
      console.error('Falha ao importar arquivo:', error)
      setNotice('Não foi possível importar esse arquivo.')
    }
  }

  function saveNow() {
    saveDraftImmediately()
    setNotice('Rascunho salvo neste navegador.')
  }

  const saveLabel = saveState === 'saving'
    ? 'Salvando…'
    : saveState === 'error'
      ? 'Erro ao salvar'
      : formatSavedAt(lastSaved)

  return (
    <main className={`writer-page ${fullscreen ? 'is-fullscreen' : ''}`}>
      <header className="writer-topbar">
        <div className="writer-topbar-left">
          <Link className="writer-brand" href="/" aria-label="Voltar para a página inicial">
            <span>✦</span>
            <strong>Archive Nova</strong>
          </Link>
          <span className="writer-top-divider" />
          <div className="writer-document-meta">
            <input
              className="writer-document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Obra sem título"
              aria-label="Título da obra"
              maxLength={180}
            />
            <div className={`writer-save-state ${saveState}`}>
              <span className="writer-save-dot" />
              {saveLabel}
              <small>neste navegador</small>
            </div>
          </div>
        </div>

        <div className="writer-topbar-actions">
          <Link className="writer-nav-link" href="/explore">Explorar</Link>
          <button className="writer-action-button subtle" type="button" onClick={createNewDraft}>Novo</button>
          <button className="writer-action-button subtle" type="button" onClick={() => fileInput.current?.click()}>Importar</button>
          <input
            ref={fileInput}
            type="file"
            className="writer-hidden-input"
            accept=".txt,.md,.html,.htm,text/plain,text/markdown,text/html"
            onChange={importFile}
          />
          <button className="writer-action-button subtle" type="button" onClick={toggleFullscreen}>{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button>
          <button className="writer-action-button" type="button" onClick={saveNow}>Salvar agora</button>
          <button
            className="writer-action-button primary"
            type="button"
            onClick={() => setNotice('Seu texto está salvo. O novo fluxo de publicação será conectado na próxima fase.')}
          >
            Publicar
          </button>
        </div>
      </header>

      <div className="writer-toolbar-wrap">
        <EditorToolbar editor={editor} />
      </div>

      <div className="writer-workspace">
        <aside className="writer-side-rail" aria-label="Informações do documento">
          <div className="writer-rail-card">
            <span className="writer-rail-label">RASCUNHO</span>
            <strong>{title.trim() || 'Sem título'}</strong>
            <p>Escreva primeiro. Fandoms, tags, classificação e resumo entram apenas na publicação.</p>
          </div>

          <div className="writer-rail-stats">
            <div><strong>{wordCount.toLocaleString('pt-BR')}</strong><span>palavras</span></div>
            <div><strong>{characterCount.toLocaleString('pt-BR')}</strong><span>caracteres</span></div>
          </div>

          <div className="writer-rail-note">
            <span>Autosave</span>
            <p>Por enquanto o rascunho é salvo localmente neste navegador. A sincronização com sua conta entra junto do sistema de rascunhos.</p>
          </div>
        </aside>

        <section className="writer-canvas" aria-label="Editor da história">
          <article className="writer-paper">
            <div className="writer-paper-head">
              <span>CAPÍTULO 01</span>
              <input
                value={chapterTitle}
                onChange={(event) => setChapterTitle(event.target.value)}
                placeholder="Título do capítulo (opcional)"
                aria-label="Título do capítulo"
                maxLength={180}
              />
            </div>

            <EditorContent editor={editor} />

            <footer className="writer-paper-footer">
              <span>{wordCount.toLocaleString('pt-BR')} palavras</span>
              <span>Archive Nova Writer</span>
            </footer>
          </article>
        </section>
      </div>

      {notice ? <div className="writer-toast" role="status">{notice}</div> : null}
    </main>
  )
}
