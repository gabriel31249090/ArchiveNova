'use client'

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WriterExperienceView } from '@/components/editor/writer-experience-view'
import type { CloudDraft, CloudDraftChapter } from '@/lib/cloud-drafts'
import {
  assetLabel,
  stageLabel,
  stripWriterHtml,
  writerStreak,
  type WriterAsset,
  type WriterAssetKind,
  type WriterDraftVersion,
  type WriterWorkspaceState,
} from '@/lib/writer-experience'

type Tab = 'overview' | 'chapters' | 'plan' | 'notes' | 'versions' | 'tools' | 'beta'

type SearchHit = { chapter_id: string; title: string; position: number; matches: number }
type Consistency = {
  missing_titles?: Array<{ chapter_id: string; position: number }>
  short_chapters?: Array<{ chapter_id: string; position: number; word_count: number }>
  empty_chapters?: Array<{ chapter_id: string; position: number }>
  ready_without_target?: Array<{ chapter_id: string; position: number }>
  duplicate_titles?: Array<{ title: string; count: number }>
}

const EMPTY_STATE: WriterWorkspaceState = { assets: [], annotations: [], versions: [], activity: [], beta_invites: [], beta_feedback: [] }
const ASSET_KINDS: WriterAssetKind[] = ['CHARACTER', 'LOCATION', 'TIMELINE', 'NOTE', 'SNIPPET']

function pct(value: number, target: number) { return target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0 }
function renderWordDiff(previousHtml: string, currentHtml: string) {
  const previous = stripWriterHtml(previousHtml).split(/\s+/u).filter(Boolean)
  const current = stripWriterHtml(currentHtml).split(/\s+/u).filter(Boolean)
  return current.map((word, index) => previous[index] === word ? <span key={`${index}-${word}`}>{word} </span> : <mark key={`${index}-${word}`}>{word} </mark>)
}

function dateTimeLocal(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function WriterExperienceDock({ draftId }: { draftId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [draft, setDraft] = useState<CloudDraft | null>(null)
  const [state, setState] = useState<WriterWorkspaceState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const [previewChapter, setPreviewChapter] = useState<CloudDraftChapter | null>(null)
  const [compareVersion, setCompareVersion] = useState<WriterDraftVersion | null>(null)

  const [assetKind, setAssetKind] = useState<WriterAssetKind>('CHARACTER')
  const [assetTitle, setAssetTitle] = useState('')
  const [assetBody, setAssetBody] = useState('')
  const [editingAsset, setEditingAsset] = useState<string | null>(null)

  const [noteBody, setNoteBody] = useState('')
  const [noteAnchor, setNoteAnchor] = useState('')
  const [find, setFind] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [consistency, setConsistency] = useState<Consistency | null>(null)
  const [betaLabel, setBetaLabel] = useState('Leitor beta')
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [draftResult, workspaceResult] = await Promise.all([
      supabase.rpc('get_writer_draft', { target_draft: draftId }),
      supabase.rpc('writer_workspace_state', { target_draft: draftId }),
    ])
    if (draftResult.error || !draftResult.data) {
      console.error(draftResult.error)
      setNotice('Não foi possível carregar o Writer Workspace.')
      setLoading(false)
      return
    }
    const nextDraft = draftResult.data as unknown as CloudDraft
    setDraft(nextDraft)
    if (!selectedChapterId && nextDraft.chapters?.[0]) setSelectedChapterId(nextDraft.chapters[0].id)
    if (!workspaceResult.error && workspaceResult.data) setState(workspaceResult.data as unknown as WriterWorkspaceState)
    setLoading(false)
  }, [draftId, selectedChapterId, supabase])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(id)
  }, [notice])

  const selectedChapter = draft?.chapters.find((chapter) => chapter.id === selectedChapterId) || draft?.chapters[0]
  const totalWords = draft?.chapters.reduce((sum, chapter) => sum + Number(chapter.word_count || 0), 0) || 0
  const today = new Date().toISOString().slice(0, 10)
  const todayWords = state.activity.filter((row) => row.activity_date === today).reduce((sum, row) => sum + Number(row.words_added || 0), 0)
  const weekWords = state.activity.slice(-7).reduce((sum, row) => sum + Number(row.words_added || 0), 0)
  const streak = writerStreak(state.activity)

  async function saveGoals() {
    if (!draft) return
    setBusy(true)
    const { error } = await supabase.rpc('writer_update_goals', {
      target_draft: draftId,
      daily_goal: Number(draft.daily_word_goal || 0),
      weekly_goal: Number(draft.weekly_word_goal || 0),
      project_goal: draft.project_word_goal ? Number(draft.project_word_goal) : null,
    })
    setBusy(false)
    setNotice(error ? 'Não foi possível salvar as metas.' : 'Metas atualizadas.')
  }

  async function saveChapterMeta(chapter: CloudDraftChapter) {
    setBusy(true)
    const { error } = await supabase.rpc('writer_update_chapter_meta', {
      target_chapter: chapter.id,
      next_stage: chapter.stage || 'DRAFT',
      next_synopsis: chapter.synopsis || '',
      next_pov: chapter.pov || '',
      next_target_words: chapter.target_words || null,
      next_scheduled_for: chapter.scheduled_for || null,
    })
    setBusy(false)
    setNotice(error ? 'Não foi possível salvar os dados do capítulo.' : 'Capítulo organizado.')
    if (!error) void load()
  }

  function patchChapter(id: string, patch: Partial<CloudDraftChapter>) {
    setDraft((current) => current ? { ...current, chapters: current.chapters.map((chapter) => chapter.id === id ? { ...chapter, ...patch } : chapter) } : current)
  }

  async function reorder(draggedId: string, targetId: string) {
    if (!draft || draggedId === targetId) return
    const next = [...draft.chapters]
    const from = next.findIndex((chapter) => chapter.id === draggedId)
    const to = next.findIndex((chapter) => chapter.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setDraft({ ...draft, chapters: next.map((chapter, index) => ({ ...chapter, position: index + 1 })) })
    const { error } = await supabase.rpc('reorder_writer_draft_chapters', { target_draft: draftId, ordered_chapter_ids: next.map((chapter) => chapter.id) })
    setNotice(error ? 'Não foi possível reordenar os capítulos.' : 'Ordem dos capítulos atualizada.')
    if (error) void load()
  }

  async function saveAsset() {
    if (!assetTitle.trim()) { setNotice('Dê um título ao item.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('writer_upsert_asset', {
      target_draft: draftId,
      asset_id: editingAsset,
      asset_kind: assetKind,
      asset_title: assetTitle.trim(),
      asset_body: assetBody,
      asset_metadata: {},
    })
    setBusy(false)
    if (error) { setNotice('Não foi possível salvar no planejamento.'); return }
    setAssetTitle(''); setAssetBody(''); setEditingAsset(null)
    setNotice('Planejamento salvo.')
    void load()
  }

  function editAsset(asset: WriterAsset) {
    setAssetKind(asset.kind); setAssetTitle(asset.title); setAssetBody(asset.body); setEditingAsset(asset.id)
  }

  async function deleteAsset(id: string) {
    const { error } = await supabase.rpc('writer_delete_asset', { asset_id: id })
    setNotice(error ? 'Não foi possível excluir.' : 'Item removido.')
    if (!error) void load()
  }

  async function addNote() {
    if (!noteBody.trim()) return
    const { error } = await supabase.rpc('writer_add_annotation', {
      target_draft: draftId,
      target_chapter: selectedChapter?.id || null,
      note_body: noteBody.trim(),
      note_anchor: noteAnchor.trim() || null,
    })
    if (error) { setNotice('Não foi possível salvar a nota.'); return }
    setNoteBody(''); setNoteAnchor(''); setNotice('Nota privada criada.'); void load()
  }

  async function toggleNote(id: string, resolved: boolean) {
    await supabase.rpc('writer_set_annotation_resolved', { note_id: id, next_resolved: resolved })
    void load()
  }

  async function snapshot() {
    if (!selectedChapter) return
    const { error } = await supabase.rpc('writer_create_snapshot', { target_chapter: selectedChapter.id })
    setNotice(error ? 'Não foi possível criar a versão.' : 'Versão manual criada.')
    if (!error) void load()
  }

  async function restoreVersion(id: string) {
    if (!window.confirm('Restaurar esta versão? A versão atual será preservada no histórico.')) return
    const { error } = await supabase.rpc('writer_restore_snapshot', { version_id: id })
    setNotice(error ? 'Não foi possível restaurar.' : 'Versão restaurada. Recarregando o editor…')
    if (!error) window.setTimeout(() => window.location.reload(), 700)
  }

  async function searchEverywhere() {
    if (!find.trim()) return
    const { data, error } = await supabase.rpc('writer_search_draft', { target_draft: draftId, search_text: find.trim() })
    if (error) { setNotice('Busca global falhou.'); return }
    setSearchHits(Array.isArray(data) ? data as unknown as SearchHit[] : [])
  }

  async function replaceEverywhere(apply: boolean) {
    if (!find.trim()) return
    if (apply && !window.confirm(`Substituir “${find}” em todos os capítulos encontrados? Uma versão será criada antes da mudança.`)) return
    const { data, error } = await supabase.rpc('writer_replace_draft', { target_draft: draftId, find_text: find, replacement_text: replaceWith, apply_changes: apply })
    if (error) { setNotice('Não foi possível executar a substituição.'); return }
    const result = (data || {}) as Record<string, unknown>
    setNotice(apply ? `Substituição aplicada em ${Number(result.chapters || 0)} capítulo(s).` : `${Number(result.chapters || 0)} capítulo(s) seriam alterados.`)
    if (apply) window.setTimeout(() => window.location.reload(), 850)
  }

  async function importAsChapters(file: File) {
    setImporting(true)
    try {
      const body = new FormData(); body.set('file', file)
      const response = await fetch('/api/import-document', { method: 'POST', body })
      const imported = await response.json() as { html?: string; title?: string; error?: string }
      if (!response.ok || !imported.html) throw new Error(imported.error || 'Falha na importação')
      const parser = new DOMParser()
      const doc = parser.parseFromString(imported.html, 'text/html')
      const sections: Array<{ title: string; html: string }> = []
      let current = { title: imported.title || file.name.replace(/\.[^.]+$/, ''), html: '' }
      for (const node of Array.from(doc.body.childNodes)) {
        if (node instanceof HTMLElement && ['H1','H2'].includes(node.tagName)) {
          if (current.html.trim()) sections.push(current)
          current = { title: (node.textContent || '').trim() || `Capítulo ${sections.length + 1}`, html: '' }
        } else {
          current.html += node instanceof HTMLElement ? node.outerHTML : node.textContent || ''
        }
      }
      if (current.html.trim()) sections.push(current)
      if (!sections.length) sections.push({ title: imported.title || 'Capítulo importado', html: imported.html })
      const { data, error } = await supabase.rpc('writer_import_chapters', { target_draft: draftId, imported_chapters: sections })
      if (error) throw error
      setNotice(`${Number(data || sections.length)} capítulo(s) importado(s).`)
      await load()
    } catch (error) {
      console.error(error); setNotice('Não foi possível importar o documento como capítulos.')
    } finally { setImporting(false) }
  }

  async function runConsistency() {
    const { data, error } = await supabase.rpc('writer_consistency_report', { target_draft: draftId })
    if (error) { setNotice('Não foi possível analisar a consistência.'); return }
    setConsistency((data || {}) as Consistency)
  }

  async function createBetaInvite() {
    const { data, error } = await supabase.rpc('writer_create_beta_invite', { target_draft: draftId, invite_label: betaLabel, valid_days: 30 })
    if (error || !data) { setNotice('Não foi possível criar o convite.'); return }
    const token = String((data as Record<string, unknown>).token || '')
    const link = `${window.location.origin}/beta/${token}`
    try { await navigator.clipboard.writeText(link); setNotice('Link beta criado e copiado.') } catch { setNotice(`Link beta: ${link}`) }
    void load()
  }

  async function revokeBeta(id: string) {
    const { error } = await supabase.rpc('writer_revoke_beta_invite', { invite_id: id })
    setNotice(error ? 'Não foi possível revogar.' : 'Convite revogado.')
    if (!error) void load()
  }

  const consistencyCount = consistency ? Object.values(consistency).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0) : 0

  return <WriterExperienceView ctx={{ supabase, open, setOpen, tab, setTab, draft, setDraft, state, setState, loading, setLoading, notice, setNotice, busy, setBusy, selectedChapterId, setSelectedChapterId, previewChapter, setPreviewChapter, compareVersion, setCompareVersion, assetKind, setAssetKind, assetTitle, setAssetTitle, assetBody, setAssetBody, editingAsset, setEditingAsset, noteBody, setNoteBody, noteAnchor, setNoteAnchor, find, setFind, replaceWith, setReplaceWith, searchHits, setSearchHits, consistency, setConsistency, betaLabel, setBetaLabel, importing, setImporting, load, selectedChapter, totalWords, today, todayWords, weekWords, streak, saveGoals, saveChapterMeta, patchChapter, reorder, saveAsset, editAsset, deleteAsset, addNote, toggleNote, snapshot, restoreVersion, searchEverywhere, replaceEverywhere, importAsChapters, runConsistency, createBetaInvite, revokeBeta, consistencyCount, ASSET_KINDS, assetLabel, stageLabel, pct, dateTimeLocal, stripWriterHtml, renderWordDiff }} />
}
