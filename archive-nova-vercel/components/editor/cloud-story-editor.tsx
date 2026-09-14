'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createClient } from '@/lib/supabase/client'
import { type CloudDraft, type CloudDraftChapter, readCloudMirror, writeCloudMirror, clearCloudMirror } from '@/lib/cloud-drafts'
import {
  createArchiveEditorExtensions,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
} from '@/components/editor/editor-extensions'

type TiptapEditor = NonNullable<ReturnType<typeof useEditor>>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type WriterMode = 'write' | 'focus' | 'read'
type ImportMode = 'replace' | 'append'

type ImportResult = {
  name: string
  title: string
  html: string
  preview: string
  words: number
  characters: number
  warnings: string[]
}

const SUPPORTED_IMPORTS = '.docx,.pdf,.txt,.md,.markdown,.html,.htm,.rtf,.doc'

function countWords(text: string) {
  const cleaned = text.trim()
  return cleaned ? cleaned.split(/\s+/u).length : 0
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
  className = '',
}: {
  active?: boolean
  disabled?: boolean
  label: string
  title: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      className={`writer-tool-button ${active ? 'active' : ''} ${className}`}
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

function applyIndent(editor: TiptapEditor, value: string | null) {
  if (editor.isActive('heading')) {
    editor.chain().focus().updateAttributes('heading', { textIndent: value }).run()
  } else {
    editor.chain().focus().updateAttributes('paragraph', { textIndent: value }).run()
  }
}

function setLink(editor: TiptapEditor) {
  const current = String(editor.getAttributes('link').href || '')
  const href = window.prompt('Cole o endereço do link:', current || 'https://')
  if (href === null) return
  if (!href.trim()) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}

function EditorToolbar({
  editor,
  compact = false,
  onOpenFind,
}: {
  editor: TiptapEditor | null
  compact?: boolean
  onOpenFind: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)

  if (!editor) return <div className="writer-toolbar-skeleton" aria-hidden="true" />

  const activeFont = String(editor.getAttributes('textStyle').fontFamily || '')
  const activeSize = String(editor.getAttributes('textStyle').fontSize || '16px')
  const activeLineHeight = String(editor.getAttributes('textStyle').lineHeight || '1.65')
  const textColor = String(editor.getAttributes('textStyle').color || '#201b1c')
  const highlightColor = String(editor.getAttributes('highlight').color || '#fff1a8')

  return (
    <div className={`writer-toolbar-v5 ${compact ? 'compact' : ''}`} role="toolbar" aria-label="Ferramentas de formatação">
      <div className="writer-tool-group essentials">
        <ToolbarButton label="↶" title="Desfazer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton label="↷" title="Refazer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group writer-format-selects">
        <select
          className="writer-tool-select font"
          aria-label="Fonte"
          value={activeFont}
          onChange={(event) => {
            const value = event.target.value
            if (value) editor.chain().focus().setFontFamily(value).run()
            else editor.chain().focus().unsetFontFamily().run()
          }}
        >
          <option value="">Fonte</option>
          {FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
        </select>
        <select
          className="writer-tool-select size"
          aria-label="Tamanho da fonte"
          value={FONT_SIZE_OPTIONS.includes(activeSize as (typeof FONT_SIZE_OPTIONS)[number]) ? activeSize : '16px'}
          onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}
        >
          {FONT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size.replace('px', '')}</option>)}
        </select>
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group essentials">
        <ToolbarButton label="B" title="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="I" title="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="U" title="Sublinhado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolbarButton label="S" title="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      </div>

      <div className={`writer-toolbar-more ${moreOpen ? 'open' : ''}`}>
        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <label className="writer-color-tool" title="Cor do texto">
            <span>A</span>
            <i style={{ background: textColor }} />
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(textColor) ? textColor : '#201b1c'}
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
              aria-label="Cor do texto"
            />
          </label>
          <label className="writer-color-tool highlight" title="Marca-texto">
            <span>▰</span>
            <i style={{ background: highlightColor }} />
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(highlightColor) ? highlightColor : '#fff1a8'}
              onChange={(event) => editor.chain().focus().setHighlight({ color: event.target.value }).run()}
              aria-label="Cor do marca-texto"
            />
          </label>
          <ToolbarButton label="x₂" title="Subscrito" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} />
          <ToolbarButton label="x²" title="Sobrescrito" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <select
            className="writer-tool-select paragraph"
            aria-label="Estilo do parágrafo"
            value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'h1') editor.chain().focus().setHeading({ level: 1 }).run()
              else if (value === 'h2') editor.chain().focus().setHeading({ level: 2 }).run()
              else if (value === 'h3') editor.chain().focus().setHeading({ level: 3 }).run()
              else editor.chain().focus().setParagraph().run()
            }}
          >
            <option value="p">Texto normal</option>
            <option value="h1">Título 1</option>
            <option value="h2">Título 2</option>
            <option value="h3">Título 3</option>
          </select>
          <select
            className="writer-tool-select line-height"
            aria-label="Espaçamento entre linhas"
            value={LINE_HEIGHT_OPTIONS.includes(activeLineHeight as (typeof LINE_HEIGHT_OPTIONS)[number]) ? activeLineHeight : '1.65'}
            onChange={(event) => editor.chain().focus().setLineHeight(event.target.value).run()}
          >
            {LINE_HEIGHT_OPTIONS.map((height) => <option key={height} value={height}>{height}×</option>)}
          </select>
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="≡" title="Alinhar à esquerda" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <ToolbarButton label="≣" title="Centralizar" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <ToolbarButton label="☷" title="Alinhar à direita" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <ToolbarButton label="▤" title="Justificar" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} />
          <ToolbarButton label="⇥" title="Recuo de primeira linha" onClick={() => applyIndent(editor, '2em')} />
          <ToolbarButton label="⇤" title="Remover recuo" onClick={() => applyIndent(editor, null)} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="•" title="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="1." title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton label="❝" title="Citação" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton label="—" title="Linha divisória" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          <ToolbarButton label="↗" title="Inserir ou editar link" active={editor.isActive('link')} onClick={() => setLink(editor)} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="▦" title="Inserir tabela 3 × 3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <ToolbarButton label="+C" title="Adicionar coluna" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolbarButton label="+L" title="Adicionar linha" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolbarButton label="−C" title="Excluir coluna" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().deleteColumn().run()} />
          <ToolbarButton label="−L" title="Excluir linha" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().deleteRow().run()} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="⌁" title="Inserir quebra de página" onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()} />
          <ToolbarButton label="⌕" title="Localizar e substituir" onClick={onOpenFind} />
          <ToolbarButton
            label="Tx"
            title="Limpar formatação"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run()}
          />
        </div>
      </div>

      <button
        className={`writer-more-tools-button ${moreOpen ? 'active' : ''}`}
        type="button"
        onClick={() => setMoreOpen((current) => !current)}
        aria-expanded={moreOpen}
      >
        <span>•••</span>
        <small>{moreOpen ? 'Menos' : 'Mais'}</small>
      </button>
    </div>
  )
}

function ImportDialog({
  result,
  mode,
  loading,
  error,
  onModeChange,
  onApply,
  onClose,
}: {
  result: ImportResult | null
  mode: ImportMode
  loading: boolean
  error: string
  onModeChange: (mode: ImportMode) => void
  onApply: () => void
  onClose: () => void
}) {
  return (
    <div className="writer-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !loading) onClose() }}>
      <section className="writer-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header>
          <div><p className="eyebrow">Importar história</p><h2 id="import-title">{loading ? 'Lendo seu arquivo…' : result ? result.name : 'Não foi possível importar'}</h2></div>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Fechar">×</button>
        </header>

        {loading ? (
          <div className="writer-import-loading"><span /><strong>Convertendo o documento</strong><p>Arquivos grandes e PDFs podem levar alguns segundos.</p></div>
        ) : error ? (
          <div className="writer-import-error"><span>!</span><p>{error}</p></div>
        ) : result ? (
          <>
            <div className="writer-import-stats">
              <div><strong>{result.words.toLocaleString('pt-BR')}</strong><span>palavras</span></div>
              <div><strong>{result.characters.toLocaleString('pt-BR')}</strong><span>caracteres</span></div>
              <div><strong>{result.title || '—'}</strong><span>título detectado</span></div>
            </div>

            {result.warnings.length ? (
              <div className="writer-import-warning"><strong>Observações da importação</strong>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
            ) : null}

            <div className="writer-import-preview"><span>PRÉVIA</span><p>{result.preview || 'O documento não contém texto legível.'}</p></div>

            <fieldset className="writer-import-mode">
              <legend>O que fazer com o texto que já está no editor?</legend>
              <label className={mode === 'replace' ? 'selected' : ''}><input type="radio" checked={mode === 'replace'} onChange={() => onModeChange('replace')} /><span><strong>Substituir conteúdo</strong><small>O texto atual será trocado pelo arquivo importado.</small></span></label>
              <label className={mode === 'append' ? 'selected' : ''}><input type="radio" checked={mode === 'append'} onChange={() => onModeChange('append')} /><span><strong>Inserir no final</strong><small>Mantém o conteúdo atual e adiciona o documento abaixo.</small></span></label>
            </fieldset>
          </>
        ) : null}

        <footer>
          <button className="ghost-button" type="button" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="primary-button" type="button" onClick={onApply} disabled={loading || !result}>Importar para o editor →</button>
        </footer>
      </section>
    </div>
  )
}

function FindReplacePanel({ editor, onClose }: { editor: TiptapEditor; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchIndex, setMatchIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    if (!query) return [] as Array<{ from: number; to: number }>
    const needle = query.toLocaleLowerCase('pt-BR')
    const found: Array<{ from: number; to: number }> = []
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const haystack = node.text.toLocaleLowerCase('pt-BR')
      let offset = 0
      while (offset <= haystack.length - needle.length) {
        const index = haystack.indexOf(needle, offset)
        if (index < 0) break
        found.push({ from: pos + index, to: pos + index + query.length })
        offset = index + Math.max(1, query.length)
      }
    })
    return found
  }, [editor, query, editor.state.doc.content.size])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => setMatchIndex(matches.length ? 0 : -1), [query, matches.length])

  const selectMatch = (index: number) => {
    if (!matches.length) return
    const normalized = (index + matches.length) % matches.length
    const match = matches[normalized]
    setMatchIndex(normalized)
    editor.chain().focus().setTextSelection(match).scrollIntoView().run()
  }

  const replaceCurrent = () => {
    if (!matches.length) return
    const index = matchIndex < 0 ? 0 : Math.min(matchIndex, matches.length - 1)
    const match = matches[index]
    editor.chain().focus().insertContentAt(match, replacement).run()
  }

  const replaceAll = () => {
    if (!matches.length) return
    const transaction = editor.state.tr
    for (const match of [...matches].reverse()) transaction.insertText(replacement, match.from, match.to)
    editor.view.dispatch(transaction)
  }

  return (
    <div className="writer-find-panel" role="search">
      <div className="writer-find-row">
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Localizar…" aria-label="Localizar" />
        <span>{matches.length ? `${matchIndex + 1}/${matches.length}` : '0/0'}</span>
        <button type="button" disabled={!matches.length} onClick={() => selectMatch(matchIndex - 1)} aria-label="Resultado anterior">↑</button>
        <button type="button" disabled={!matches.length} onClick={() => selectMatch(matchIndex + 1)} aria-label="Próximo resultado">↓</button>
        <button type="button" onClick={onClose} aria-label="Fechar busca">×</button>
      </div>
      <div className="writer-find-row replace">
        <input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="Substituir por…" aria-label="Substituir por" />
        <button type="button" disabled={!matches.length} onClick={replaceCurrent}>Substituir</button>
        <button type="button" disabled={!matches.length} onClick={replaceAll}>Tudo</button>
      </div>
    </div>
  )
}


export function CloudStoryEditor({ draftId }: { draftId: string }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const savingRef = useRef(false)
  const queuedSaveRef = useRef(false)
  const saveFunctionRef = useRef<() => Promise<void>>(async () => undefined)

  const [title, setTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [contentHtml, setContentHtml] = useState('<p></p>')
  const [wordCount, setWordCount] = useState(0)
  const [characterCount, setCharacterCount] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hydratedDraft, setHydratedDraft] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(true)
  const [loadError, setLoadError] = useState('')
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
  const [chapters, setChapters] = useState<CloudDraftChapter[]>([])
  const [activeChapterId, setActiveChapterId] = useState('')
  const [draftRevision, setDraftRevision] = useState(1)
  const [chapterRevision, setChapterRevision] = useState(1)
  const [pendingSync, setPendingSync] = useState(false)
  const [online, setOnline] = useState(true)
  const [conflict, setConflict] = useState<null | {
    draftRevision: number
    chapterRevision: number
    remote: { title: string; chapter_title: string; content_html: string; word_count: number }
  }>(null)

  const extensions = useMemo(() => createArchiveEditorExtensions(), [])

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'story-editor-content story-editor-pro', spellcheck: 'true', 'aria-label': 'Texto do capítulo' } },
    onUpdate: ({ editor: currentEditor }: { editor: TiptapEditor }) => {
      const text = currentEditor.getText({ blockSeparator: '\n' })
      setContentHtml(currentEditor.getHTML())
      setWordCount(countWords(text))
      setCharacterCount(text.length)
    },
  })

  const applyChapter = useCallback((chapter: CloudDraftChapter, nextTitle?: string) => {
    if (!editor) return
    if (typeof nextTitle === 'string') setTitle(nextTitle)
    setActiveChapterId(chapter.id)
    setChapterTitle(chapter.title || '')
    setContentHtml(chapter.content_html || '<p></p>')
    setChapterRevision(Number(chapter.revision || 1))
    editor.commands.setContent(chapter.content_html || '<p></p>', { emitUpdate: false })
    const text = editor.getText({ blockSeparator: '\n' })
    setWordCount(countWords(text))
    setCharacterCount(text.length)
  }, [editor])

  const loadCloudDraft = useCallback(async (preferredChapterId?: string) => {
    if (!supabase || !editor) return false
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      window.location.replace(`/explore?auth=login&return=${encodeURIComponent(`/write/${draftId}`)}`)
      return false
    }
    const { data, error } = await supabase.rpc('get_writer_draft', { target_draft: draftId })
    if (error || !data) {
      console.error(error)
      setLoadError('Não foi possível abrir este rascunho. Verifique se ele existe e pertence à sua conta.')
      setLoadingDraft(false)
      return false
    }
    const cloud = data as unknown as CloudDraft
    const list = Array.isArray(cloud.chapters) ? cloud.chapters : []
    if (!list.length) {
      setLoadError('Este rascunho não possui capítulos.')
      setLoadingDraft(false)
      return false
    }
    setChapters(list)
    setDraftRevision(Number(cloud.revision || 1))
    const chapter = list.find((item) => item.id === preferredChapterId) || list.find((item) => item.id === activeChapterId) || list[0]
    const mirror = readCloudMirror(draftId)
    const useMirror = mirror?.pendingSync && mirror.chapterId === chapter.id && new Date(mirror.updatedAt).getTime() > new Date(chapter.updated_at || 0).getTime()
    if (useMirror && mirror) {
      setTitle(mirror.title)
      setActiveChapterId(chapter.id)
      setChapterTitle(mirror.chapterTitle)
      setContentHtml(mirror.content)
      setChapterRevision(Number(chapter.revision || 1))
      editor.commands.setContent(mirror.content || '<p></p>', { emitUpdate: false })
      const text = editor.getText({ blockSeparator: '\n' })
      setWordCount(countWords(text))
      setCharacterCount(text.length)
      setPendingSync(true)
      setNotice('Recuperamos alterações locais que ainda não tinham chegado à nuvem.')
    } else {
      applyChapter(chapter, cloud.title || '')
      setPendingSync(false)
    }
    setLastSaved(new Date(cloud.updated_at || chapter.updated_at || Date.now()))
    setHydratedDraft(true)
    setSaveState('saved')
    setLoadingDraft(false)
    setLoadError('')
    return true
  }, [activeChapterId, applyChapter, draftId, editor, supabase])

  useEffect(() => {
    if (!editor || hydratedDraft) return
    if (!supabase) { setLoadError('Supabase não configurado.'); setLoadingDraft(false); return }
    void loadCloudDraft()
  }, [editor, hydratedDraft, loadCloudDraft, supabase])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const persistMirror = useCallback((pending: boolean) => {
    if (!hydratedDraft || !activeChapterId) return
    writeCloudMirror({ version: 1, draftId, chapterId: activeChapterId, title, chapterTitle, content: contentHtml, updatedAt: new Date().toISOString(), pendingSync: pending })
  }, [activeChapterId, chapterTitle, contentHtml, draftId, hydratedDraft, title])

  const saveDraftImmediately = useCallback(async () => {
    if (!hydratedDraft || !activeChapterId || !editor) return
    persistMirror(true)
    setPendingSync(true)
    if (!supabase || !navigator.onLine || conflict) { setSaveState(supabase ? 'idle' : 'error'); return }
    if (savingRef.current) { queuedSaveRef.current = true; return }
    savingRef.current = true
    setSaveState('saving')
    try {
      const { data, error } = await supabase.rpc('save_writer_draft', {
        target_draft: draftId,
        target_chapter: activeChapterId,
        next_title: title,
        next_chapter_title: chapterTitle,
        next_content_html: contentHtml,
        next_content_json: editor.getJSON(),
        next_word_count: wordCount,
        expected_draft_revision: draftRevision,
        expected_chapter_revision: chapterRevision,
      })
      if (error) throw error
      const result = (data || {}) as Record<string, unknown>
      if (result.conflict) {
        const remote = (result.remote || {}) as Record<string, unknown>
        setConflict({
          draftRevision: Number(result.draft_revision || draftRevision),
          chapterRevision: Number(result.chapter_revision || chapterRevision),
          remote: { title: String(remote.title || ''), chapter_title: String(remote.chapter_title || ''), content_html: String(remote.content_html || '<p></p>'), word_count: Number(remote.word_count || 0) },
        })
        setSaveState('error')
        return
      }
      const nextDraftRevision = Number(result.draft_revision || draftRevision + 1)
      const nextChapterRevision = Number(result.chapter_revision || chapterRevision + 1)
      const savedAt = new Date(String(result.updated_at || new Date().toISOString()))
      setDraftRevision(nextDraftRevision)
      setChapterRevision(nextChapterRevision)
      setLastSaved(savedAt)
      setPendingSync(false)
      setSaveState('saved')
      persistMirror(false)
      setChapters((current) => current.map((chapter) => chapter.id === activeChapterId ? { ...chapter, title: chapterTitle, content_html: contentHtml, word_count: wordCount, revision: nextChapterRevision, updated_at: savedAt.toISOString() } : chapter))
    } catch (error) {
      console.error('Falha ao sincronizar rascunho:', error)
      setSaveState(navigator.onLine ? 'error' : 'idle')
      setPendingSync(true)
    } finally {
      savingRef.current = false
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false
        window.setTimeout(() => { void saveFunctionRef.current() }, 80)
      }
    }
  }, [activeChapterId, chapterRevision, chapterTitle, conflict, contentHtml, draftId, draftRevision, editor, hydratedDraft, persistMirror, supabase, title, wordCount])

  useEffect(() => { saveFunctionRef.current = saveDraftImmediately }, [saveDraftImmediately])

  useEffect(() => {
    if (!hydratedDraft) return
    persistMirror(true)
    setPendingSync(true)
    if (!online || conflict) return
    const timer = window.setTimeout(() => { void saveDraftImmediately() }, 700)
    return () => window.clearTimeout(timer)
  }, [chapterTitle, contentHtml, hydratedDraft, online, persistMirror, saveDraftImmediately, title, conflict])

  useEffect(() => {
    if (online && pendingSync && hydratedDraft && !conflict) void saveDraftImmediately()
  }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const saveBeforeLeave = () => persistMirror(pendingSync)
    window.addEventListener('beforeunload', saveBeforeLeave)
    return () => window.removeEventListener('beforeunload', saveBeforeLeave)
  }, [pendingSync, persistMirror])

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3400)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => { editor?.setEditable(writerMode !== 'read') }, [editor, writerMode])

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void saveDraftImmediately(); setNotice('Sincronizando rascunho…') }
      if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); setFindOpen(true) }
      if (mod && event.key.toLowerCase() === 'k' && editor) { event.preventDefault(); setLink(editor) }
      if (event.key === 'Escape' && writerMode !== 'write') setWriterMode('write')
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  }, [editor, saveDraftImmediately, writerMode])

  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() } catch (error) { console.error(error) }
  }

  async function createNewDraft() {
    if (!supabase) return
    if (!online) { setNotice('Conecte-se à internet para criar outro rascunho.'); return }
    await saveDraftImmediately()
    const { data, error } = await supabase.rpc('create_writer_draft', {})
    if (error || !data) { setNotice('Não foi possível criar um novo rascunho.'); return }
    const id = String((data as Record<string, unknown>).id || '')
    if (id) window.location.href = `/write/${id}`
  }

  async function switchChapter(id: string) {
    if (id === activeChapterId) return
    if (!online) { setNotice('Para proteger alterações offline, sincronize antes de trocar de capítulo.'); return }
    await saveDraftImmediately()
    const chapter = chapters.find((item) => item.id === id)
    if (chapter) applyChapter(chapter)
  }

  async function addChapter() {
    if (!supabase) return
    if (!online) { setNotice('Conecte-se à internet para adicionar um capítulo.'); return }
    await saveDraftImmediately()
    const { data, error } = await supabase.rpc('add_writer_draft_chapter', { target_draft: draftId, next_title: '' })
    if (error || !data) { setNotice('Não foi possível adicionar o capítulo.'); return }
    const id = String((data as Record<string, unknown>).id || '')
    await loadCloudDraft(id)
    setNotice('Novo capítulo adicionado.')
  }

  async function deleteChapter() {
    if (!online) { setNotice('Conecte-se à internet para excluir um capítulo.'); return }
    if (!supabase || chapters.length <= 1) { setNotice('O rascunho precisa ter pelo menos um capítulo.'); return }
    if (!window.confirm('Excluir este capítulo do rascunho? Essa ação não pode ser desfeita.')) return
    const nextId = chapters.find((item) => item.id !== activeChapterId)?.id
    const { error } = await supabase.rpc('delete_writer_draft_chapter', { target_chapter: activeChapterId })
    if (error) { setNotice('Não foi possível excluir o capítulo.'); return }
    if (nextId) await loadCloudDraft(nextId)
    setNotice('Capítulo excluído.')
  }

  async function keepLocalConflict() {
    if (!conflict || !supabase || !editor) return
    setSaveState('saving')
    const { data, error } = await supabase.rpc('save_writer_draft', {
      target_draft: draftId, target_chapter: activeChapterId, next_title: title, next_chapter_title: chapterTitle,
      next_content_html: contentHtml, next_content_json: editor.getJSON(), next_word_count: wordCount,
      expected_draft_revision: conflict.draftRevision, expected_chapter_revision: conflict.chapterRevision,
    })
    if (error || !(data as Record<string, unknown>)?.ok) { setNotice('A versão mudou novamente. Recarregue antes de continuar.'); return }
    const result = data as Record<string, unknown>
    setDraftRevision(Number(result.draft_revision || conflict.draftRevision + 1))
    setChapterRevision(Number(result.chapter_revision || conflict.chapterRevision + 1))
    setConflict(null); setPendingSync(false); setSaveState('saved'); persistMirror(false)
    setLastSaved(new Date(String(result.updated_at || new Date().toISOString())))
    setNotice('Sua versão foi mantida e sincronizada.')
  }

  function useRemoteConflict() {
    if (!conflict || !editor) return
    setTitle(conflict.remote.title)
    setChapterTitle(conflict.remote.chapter_title)
    setContentHtml(conflict.remote.content_html)
    editor.commands.setContent(conflict.remote.content_html || '<p></p>', { emitUpdate: false })
    const text = editor.getText({ blockSeparator: '\n' })
    setWordCount(countWords(text)); setCharacterCount(text.length)
    setDraftRevision(conflict.draftRevision); setChapterRevision(conflict.chapterRevision)
    setConflict(null); setPendingSync(false); setSaveState('saved'); persistMirror(false)
    setNotice('Versão da nuvem carregada.')
  }

  const processImport = useCallback(async (file: File) => {
    setImportOpen(true); setImportLoading(true); setImportError(''); setImportResult(null); setImportMode('replace')
    try {
      const body = new FormData(); body.set('file', file)
      const response = await fetch('/api/import-document', { method: 'POST', body })
      const data = await response.json() as ImportResult & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Não foi possível importar esse arquivo.')
      setImportResult(data)
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Não foi possível importar esse arquivo.') }
    finally { setImportLoading(false) }
  }, [])

  async function importFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ''; if (file) await processImport(file) }
  function applyImport() {
    if (!editor || !importResult) return
    if (importMode === 'append') editor.chain().focus('end').insertContent('<hr>').insertContent(importResult.html).run()
    else editor.commands.setContent(importResult.html)
    if (!title.trim() && importResult.title) setTitle(importResult.title)
    setImportOpen(false); setNotice(`${importResult.name} importado com sucesso.`)
  }
  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.files.length) return
    const file = event.dataTransfer.files[0]; const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['docx','pdf','txt','md','markdown','html','htm','rtf','doc'].includes(extension || '')) return
    event.preventDefault(); setDragActive(false); void processImport(file)
  }

  async function saveNow() { await saveDraftImmediately(); setNotice(navigator.onLine ? 'Rascunho sincronizado.' : 'Salvo neste dispositivo. Sincronizaremos quando a conexão voltar.') }

  const currentIndex = Math.max(0, chapters.findIndex((item) => item.id === activeChapterId))
  const saveLabel = conflict ? 'Conflito de versão' : !online ? 'Sem conexão' : pendingSync ? 'Alterações pendentes' : saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Erro ao sincronizar' : formatSavedAt(lastSaved)
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220))

  if (loadingDraft) return <main className="writer-cloud-loading"><span>✦</span><h1>Abrindo seu rascunho…</h1><p>Buscando a versão mais recente na nuvem.</p></main>
  if (loadError) return <main className="writer-cloud-loading error"><span>!</span><h1>Não foi possível abrir</h1><p>{loadError}</p><Link className="primary-button" href="/dashboard">Voltar ao Studio</Link></main>

  return (
    <main className={`writer-page writer-v5 writer-cloud mode-${writerMode} ${fullscreen ? 'is-fullscreen' : ''} ${dragActive ? 'drag-active' : ''}`} onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragActive(true) } }} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false) }} onDrop={handleDrop}>
      <header className="writer-topbar writer-topbar-v5">
        <div className="writer-topbar-left"><Link className="writer-brand" href="/" aria-label="Voltar para a página inicial"><span>✦</span><strong>Archive Nova</strong></Link><span className="writer-top-divider" /><div className="writer-document-meta"><input className="writer-document-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Obra sem título" aria-label="Título da obra" maxLength={180} /><div className={`writer-save-state ${saveState} ${!online ? 'offline' : ''} ${conflict ? 'conflict' : ''}`}><span className="writer-save-dot" />{saveLabel}<small>{online ? 'Supabase + cópia local' : 'cópia local protegida'}</small></div></div></div>
        <div className="writer-mode-switch" aria-label="Modo do editor"><button className={writerMode === 'write' ? 'active' : ''} type="button" onClick={() => setWriterMode('write')}><span>✎</span> Escrever</button><button className={writerMode === 'focus' ? 'active' : ''} type="button" onClick={() => setWriterMode('focus')}><span>◎</span> Foco</button><button className={writerMode === 'read' ? 'active' : ''} type="button" onClick={() => setWriterMode('read')}><span>◉</span> Leitura</button></div>
        <div className="writer-topbar-actions"><Link className="writer-nav-link" href="/dashboard">Studio</Link><button className="writer-action-button subtle writer-desktop-action" type="button" onClick={createNewDraft}>Novo</button><button className="writer-action-button subtle" type="button" onClick={() => fileInput.current?.click()}>Importar</button><input ref={fileInput} type="file" className="writer-hidden-input" accept={SUPPORTED_IMPORTS} onChange={importFile} /><button className="writer-action-button subtle writer-desktop-action" type="button" onClick={toggleFullscreen}>{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button><button className="writer-action-button writer-desktop-action" type="button" onClick={() => void saveNow()}>Salvar</button><button className="writer-action-button primary" type="button" onClick={async () => { if (!online) { setNotice('Conecte-se à internet para publicar.'); return } await saveDraftImmediately(); if (!title.trim()) { setNotice('Dê um título à obra antes de publicar.'); return } if (!chapters.some((item) => item.word_count > 0) && !editor?.getText().trim()) { setNotice('Escreva pelo menos um capítulo antes de publicar.'); return } window.location.href = `/publish/${draftId}` }}>Publicar</button></div>
      </header>

      {conflict ? <div className="writer-conflict-banner"><div><strong>Este rascunho foi alterado em outro dispositivo.</strong><span>Escolha qual versão deve continuar antes de salvar novamente.</span></div><button type="button" onClick={useRemoteConflict}>Usar nuvem</button><button className="primary" type="button" onClick={() => void keepLocalConflict()}>Manter esta versão</button></div> : null}
      {!online ? <div className="writer-offline-banner">Você está sem conexão. Continue escrevendo: as alterações estão salvas neste dispositivo e serão sincronizadas automaticamente.</div> : null}

      {writerMode !== 'read' ? <div className="writer-toolbar-wrap writer-toolbar-wrap-v5"><EditorToolbar editor={editor} onOpenFind={() => setFindOpen(true)} /></div> : null}
      {findOpen && editor ? <FindReplacePanel editor={editor} onClose={() => setFindOpen(false)} /> : null}

      <div className="writer-workspace writer-workspace-v5">
        <aside className="writer-side-rail writer-side-rail-v5" aria-label="Informações do documento">
          <div className="writer-rail-card"><span className="writer-rail-label">RASCUNHO NA NUVEM</span><strong>{title.trim() || 'Sem título'}</strong><p>{chapters.length} {chapters.length === 1 ? 'capítulo' : 'capítulos'} · sincronizado com sua conta.</p></div>
          <div className="writer-cloud-chapters"><div className="writer-cloud-chapters-head"><span>CAPÍTULOS</span><button type="button" onClick={() => void addChapter()}>＋</button></div>{chapters.map((chapter) => <button key={chapter.id} type="button" className={chapter.id === activeChapterId ? 'active' : ''} onClick={() => void switchChapter(chapter.id)}><b>{String(chapter.position).padStart(2,'0')}</b><span>{chapter.title || `Capítulo ${chapter.position}`}</span><small>{chapter.word_count.toLocaleString('pt-BR')} p.</small></button>)}<button className="writer-delete-chapter" type="button" disabled={chapters.length <= 1} onClick={() => void deleteChapter()}>Excluir capítulo atual</button></div>
          <div className="writer-rail-stats"><div><strong>{wordCount.toLocaleString('pt-BR')}</strong><span>palavras</span></div><div><strong>{characterCount.toLocaleString('pt-BR')}</strong><span>caracteres</span></div><div><strong>~{readingMinutes} min</strong><span>de leitura</span></div></div>
          <div className="writer-rail-note"><span>Sincronização</span><p>O Writer mantém uma cópia local de segurança. Se a internet cair, você pode continuar normalmente.</p></div>
        </aside>
        <section className="writer-canvas writer-canvas-v5" aria-label="Editor da história"><article className="writer-paper writer-paper-v5"><div className="writer-paper-head"><span>CAPÍTULO {String(currentIndex + 1).padStart(2,'0')}</span><input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} placeholder="Título do capítulo (opcional)" aria-label="Título do capítulo" maxLength={180} /></div><EditorContent editor={editor} /><footer className="writer-paper-footer"><span>{wordCount.toLocaleString('pt-BR')} palavras · ~{readingMinutes} min</span><span>Archive Nova Writer Pro · Cloud</span></footer></article></section>
      </div>

      <nav className="writer-mobile-dock" aria-label="Ações do editor"><button type="button" onClick={() => setWriterMode(writerMode === 'focus' ? 'write' : 'focus')}><span>◎</span><small>Foco</small></button><button type="button" onClick={() => void addChapter()}><span>＋</span><small>Capítulo</small></button><button type="button" onClick={() => void saveNow()}><span>✓</span><small>Salvar</small></button><button type="button" onClick={() => setFindOpen(true)}><span>⌕</span><small>Buscar</small></button></nav>
      {dragActive ? <div className="writer-drop-overlay"><div><span>⇧</span><strong>Solte para importar</strong><p>DOCX, PDF, TXT, Markdown, HTML ou RTF</p></div></div> : null}
      {importOpen ? <ImportDialog result={importResult} mode={importMode} loading={importLoading} error={importError} onModeChange={setImportMode} onApply={applyImport} onClose={() => { if (!importLoading) setImportOpen(false) }} /> : null}
      {notice ? <div className="writer-toast writer-toast-v5" role="status">{notice}</div> : null}
    </main>
  )
}
