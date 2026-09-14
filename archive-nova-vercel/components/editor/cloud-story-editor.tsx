'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useNovaConfirm } from '@/components/ui/nova-confirm'
import { type CloudDraft, type CloudDraftChapter, readCloudMirror, writeCloudMirror, clearCloudMirror } from '@/lib/cloud-drafts'
import { createArchiveEditorExtensions } from '@/components/editor/editor-extensions'
import {
  EditorToolbar,
  FindReplacePanel,
  ImportDialog,
  setLink,
  type ImportMode,
  type ImportResult,
  type TiptapEditor,
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

export function CloudStoryEditor({ draftId }: { draftId: string }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const { ask: confirmAction, dialog: confirmDialog } = useNovaConfirm()
  const savingRef = useRef(false)
  const queuedSaveRef = useRef(false)
  const saveFunctionRef = useRef<() => Promise<void>>(async () => undefined)
  const liveChannelRef = useRef<RealtimeChannel | null>(null)

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
  const [liveEditors, setLiveEditors] = useState(1)
  const [remoteUpdate, setRemoteUpdate] = useState(false)
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

  useEffect(() => {
    if (!supabase || !hydratedDraft) return
    let active = true
    let ownUserId = ''
    const channel = supabase.channel('writer-live-' + draftId, { config: { presence: { key: 'anonymous' } } })
    liveChannelRef.current = channel

    void (async () => {
      const current = (await supabase.auth.getUser()).data.user
      if (!current || !active) return
      ownUserId = current.id
      await channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState()
          setLiveEditors(Math.max(1, Object.keys(state).length))
        })
        .on('broadcast', { event: 'draft-saved' }, ({ payload }) => {
          const event = (payload || {}) as { user_id?: string; chapter_id?: string }
          if (event.user_id === ownUserId) return
          setRemoteUpdate(true)
          setNotice('Um colaborador salvou uma nova versão deste rascunho.')
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ user_id: current.id, joined_at: new Date().toISOString() })
          }
        })
    })()

    return () => {
      active = false
      if (liveChannelRef.current === channel) liveChannelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [draftId, hydratedDraft, supabase])

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
      setRemoteUpdate(false)
      void liveChannelRef.current?.send({
        type: 'broadcast',
        event: 'draft-saved',
        payload: { chapter_id: activeChapterId, saved_at: savedAt.toISOString() },
      })
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
    if (!(await confirmAction({
      title: 'Excluir capítulo do rascunho?',
      description: 'Esta ação não pode ser desfeita. O rascunho continuará com os outros capítulos.',
      confirmLabel: 'Excluir capítulo',
      tone: 'danger',
    }))) return
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
      {remoteUpdate && !conflict ? <div className="writer-collab-banner"><div><strong>Nova versão de um colaborador.</strong><span>Há uma atualização na nuvem. Recarregue antes de continuar se não tiver alterações locais pendentes.</span></div><button type="button" onClick={() => { if (pendingSync) { setNotice('Salve ou resolva suas alterações locais antes de recarregar.'); return } setRemoteUpdate(false); void loadCloudDraft(activeChapterId) }}>Recarregar versão</button></div> : null}
      {!online ? <div className="writer-offline-banner">Você está sem conexão. Continue escrevendo: as alterações estão salvas neste dispositivo e serão sincronizadas automaticamente.</div> : null}

      {writerMode !== 'read' ? <div className="writer-toolbar-wrap writer-toolbar-wrap-v5"><EditorToolbar editor={editor} onOpenFind={() => setFindOpen(true)} /></div> : null}
      {findOpen && editor ? <FindReplacePanel editor={editor} onClose={() => setFindOpen(false)} /> : null}

      <div className="writer-workspace writer-workspace-v5">
        <aside className="writer-side-rail writer-side-rail-v5" aria-label="Informações do documento">
          <div className="writer-rail-card"><span className="writer-rail-label">RASCUNHO NA NUVEM</span><strong>{title.trim() || 'Sem título'}</strong><p>{chapters.length} {chapters.length === 1 ? 'capítulo' : 'capítulos'} · sincronizado com sua conta.</p><small className="writer-live-presence"><i /> {liveEditors} {liveEditors === 1 ? 'editor online' : 'editores online'}</small></div>
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
      {confirmDialog}
      </main>
  )
}
