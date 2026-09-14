'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { DRAFT_STORAGE_KEY, type LocalWriterDraft } from '@/lib/writer-draft'
import { useNovaConfirm } from '@/components/ui/nova-confirm'
import { createArchiveEditorExtensions } from '@/components/editor/editor-extensions'
import {
  EditorToolbar,
  FindReplacePanel,
  ImportDialog,
  type ImportMode,
  type ImportResult,
} from '@/components/editor/editor-shared-ui'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type WriterMode = 'write' | 'focus' | 'read'
const SUPPORTED_IMPORTS = '.docx,.pdf,.txt,.md,.markdown,.html,.htm,.rtf,.doc'

function countWords(text: string) {
  const cleaned = text.trim()
  return cleaned ? cleaned.split(/\s+/u).length : 0
}

function formatSavedAt(date: Date | null) {
  if (!date) return 'Ainda não salvo'
  return `Salvo às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export function StoryEditor() {
  const { ask: confirmAction, dialog: confirmDialog } = useNovaConfirm()
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
  const [writerMode, setWriterMode] = useState<WriterMode>('write')
  const [findOpen, setFindOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('replace')
  const [dragActive, setDragActive] = useState(false)

  const extensions = useMemo(() => createArchiveEditorExtensions(), [])

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'story-editor-content story-editor-pro',
        spellcheck: 'true',
        'aria-label': 'Texto do capítulo',
      },
    },
    onUpdate: ({ editor: currentEditor }: { editor: TiptapEditor }) => {
      const text = currentEditor.getText({ blockSeparator: '\n' })
      setContentHtml(currentEditor.getHTML())
      setWordCount(countWords(text))
      setCharacterCount(text.length)
    },
  })

  const saveDraftImmediately = useCallback(() => {
    if (!hydratedDraft) return
    try {
      const draft: LocalWriterDraft = {
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
        const draft = JSON.parse(rawDraft) as Partial<LocalWriterDraft>
        const savedContent = typeof draft.content === 'string' ? draft.content : '<p></p>'
        setTitle(typeof draft.title === 'string' ? draft.title : '')
        setChapterTitle(typeof draft.chapterTitle === 'string' ? draft.chapterTitle : '')
        setContentHtml(savedContent)
        editor.commands.setContent(savedContent, { emitUpdate: false })
        const text = editor.getText({ blockSeparator: '\n' })
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

  useEffect(() => {
    editor?.setEditable(writerMode !== 'read')
  }, [editor, writerMode])

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveDraftImmediately()
        setNotice('Rascunho salvo neste navegador.')
      }
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFindOpen(true)
      }
      if (mod && event.key.toLowerCase() === 'k' && editor) {
        event.preventDefault()
        setLink(editor)
      }
      if (event.key === 'Escape' && writerMode !== 'write') setWriterMode('write')
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  }, [editor, saveDraftImmediately, writerMode])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch (error) {
      console.error('Não foi possível alternar a tela cheia:', error)
    }
  }

  async function createNewDraft() {
    const hasContent = Boolean(title.trim() || chapterTitle.trim() || editor?.getText().trim())
    if (hasContent && !(await confirmAction({
      title: 'Criar um novo rascunho?',
      description: 'O rascunho local atual será apagado deste navegador.',
      confirmLabel: 'Criar novo rascunho',
      tone: 'danger',
    }))) return
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

  const processImport = useCallback(async (file: File) => {
    setImportOpen(true)
    setImportLoading(true)
    setImportError('')
    setImportResult(null)
    setImportMode('replace')
    try {
      const body = new FormData()
      body.set('file', file)
      const response = await fetch('/api/import-document', { method: 'POST', body })
      const data = await response.json() as ImportResult & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Não foi possível importar esse arquivo.')
      setImportResult(data)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível importar esse arquivo.')
    } finally {
      setImportLoading(false)
    }
  }, [])

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await processImport(file)
  }

  function applyImport() {
    if (!editor || !importResult) return
    if (importMode === 'append') {
      editor.chain().focus('end').insertContent('<hr>').insertContent(importResult.html).run()
    } else {
      editor.commands.setContent(importResult.html)
    }
    if (!title.trim() && importResult.title) setTitle(importResult.title)
    setImportOpen(false)
    setNotice(`${importResult.name} importado com sucesso.`)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.files.length) return
    const file = event.dataTransfer.files[0]
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['docx', 'pdf', 'txt', 'md', 'markdown', 'html', 'htm', 'rtf', 'doc'].includes(extension || '')) return
    event.preventDefault()
    setDragActive(false)
    void processImport(file)
  }

  function saveNow() {
    saveDraftImmediately()
    setNotice('Rascunho salvo neste navegador.')
  }

  const saveLabel = saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Erro ao salvar' : formatSavedAt(lastSaved)
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220))

  return (
    <main
      className={`writer-page writer-v5 mode-${writerMode} ${fullscreen ? 'is-fullscreen' : ''} ${dragActive ? 'drag-active' : ''}`}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragActive(true) } }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false) }}
      onDrop={handleDrop}
    >
      <header className="writer-topbar writer-topbar-v5">
        <div className="writer-topbar-left">
          <Link className="writer-brand" href="/" aria-label="Voltar para a página inicial"><span>✦</span><strong>Archive Nova</strong></Link>
          <span className="writer-top-divider" />
          <div className="writer-document-meta">
            <input className="writer-document-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Obra sem título" aria-label="Título da obra" maxLength={180} />
            <div className={`writer-save-state ${saveState}`}><span className="writer-save-dot" />{saveLabel}<small>neste navegador</small></div>
          </div>
        </div>

        <div className="writer-mode-switch" aria-label="Modo do editor">
          <button className={writerMode === 'write' ? 'active' : ''} type="button" onClick={() => setWriterMode('write')}><span>✎</span> Escrever</button>
          <button className={writerMode === 'focus' ? 'active' : ''} type="button" onClick={() => setWriterMode('focus')}><span>◎</span> Foco</button>
          <button className={writerMode === 'read' ? 'active' : ''} type="button" onClick={() => setWriterMode('read')}><span>◉</span> Leitura</button>
        </div>

        <div className="writer-topbar-actions">
          <Link className="writer-nav-link" href="/explore">Explorar</Link>
          <button className="writer-action-button subtle writer-desktop-action" type="button" onClick={() => void createNewDraft()}>Novo</button>
          <button className="writer-action-button subtle" type="button" onClick={() => fileInput.current?.click()}>Importar</button>
          <input ref={fileInput} type="file" className="writer-hidden-input" accept={SUPPORTED_IMPORTS} onChange={importFile} />
          <button className="writer-action-button subtle writer-desktop-action" type="button" onClick={toggleFullscreen}>{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button>
          <button className="writer-action-button writer-desktop-action" type="button" onClick={saveNow}>Salvar</button>
          <button
            className="writer-action-button primary"
            type="button"
            onClick={() => {
              saveDraftImmediately()
              if (!title.trim()) { setNotice('Dê um título à obra antes de seguir para a publicação.'); return }
              if (!editor?.getText().trim()) { setNotice('Escreva o primeiro capítulo antes de publicar.'); return }
              window.location.href = '/publish'
            }}
          >Publicar</button>
        </div>
      </header>

      {writerMode !== 'read' ? (
        <div className="writer-toolbar-wrap writer-toolbar-wrap-v5"><EditorToolbar editor={editor} onOpenFind={() => setFindOpen(true)} /></div>
      ) : null}

      {findOpen && editor ? <FindReplacePanel editor={editor} onClose={() => setFindOpen(false)} /> : null}

      <div className="writer-workspace writer-workspace-v5">
        <aside className="writer-side-rail writer-side-rail-v5" aria-label="Informações do documento">
          <div className="writer-rail-card"><span className="writer-rail-label">RASCUNHO</span><strong>{title.trim() || 'Sem título'}</strong><p>Escreva primeiro. Fandoms, tags, classificação e resumo entram na publicação.</p></div>
          <div className="writer-rail-stats"><div><strong>{wordCount.toLocaleString('pt-BR')}</strong><span>palavras</span></div><div><strong>{characterCount.toLocaleString('pt-BR')}</strong><span>caracteres</span></div><div><strong>~{readingMinutes} min</strong><span>de leitura</span></div></div>
          <div className="writer-rail-shortcuts"><span>ATALHOS</span><p><kbd>Ctrl</kbd> + <kbd>S</kbd> salvar</p><p><kbd>Ctrl</kbd> + <kbd>F</kbd> localizar</p><p><kbd>Ctrl</kbd> + <kbd>K</kbd> link</p></div>
          <div className="writer-rail-note"><span>Importação</span><p>DOCX, PDF, TXT, Markdown, HTML e RTF. Você também pode arrastar um arquivo direto para esta tela.</p></div>
        </aside>

        <section className="writer-canvas writer-canvas-v5" aria-label="Editor da história">
          <article className="writer-paper writer-paper-v5">
            <div className="writer-paper-head"><span>CAPÍTULO 01</span><input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} placeholder="Título do capítulo (opcional)" aria-label="Título do capítulo" maxLength={180} /></div>
            <EditorContent editor={editor} />
            <footer className="writer-paper-footer"><span>{wordCount.toLocaleString('pt-BR')} palavras · ~{readingMinutes} min</span><span>Archive Nova Writer Pro</span></footer>
          </article>
        </section>
      </div>

      <nav className="writer-mobile-dock" aria-label="Ações do editor">
        <button type="button" onClick={() => setWriterMode(writerMode === 'focus' ? 'write' : 'focus')}><span>◎</span><small>Foco</small></button>
        <button type="button" onClick={() => fileInput.current?.click()}><span>⇧</span><small>Importar</small></button>
        <button type="button" onClick={saveNow}><span>✓</span><small>Salvar</small></button>
        <button type="button" onClick={() => setFindOpen(true)}><span>⌕</span><small>Buscar</small></button>
      </nav>

      {dragActive ? <div className="writer-drop-overlay"><div><span>⇧</span><strong>Solte para importar</strong><p>DOCX, PDF, TXT, Markdown, HTML ou RTF</p></div></div> : null}
      {importOpen ? <ImportDialog result={importResult} mode={importMode} loading={importLoading} error={importError} onModeChange={setImportMode} onApply={applyImport} onClose={() => { if (!importLoading) setImportOpen(false) }} /> : null}
      {notice ? <div className="writer-toast writer-toast-v5" role="status">{notice}</div> : null}
      {confirmDialog}
      </main>
  )
}
