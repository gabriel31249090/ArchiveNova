'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { WorkCard } from '@/components/work-card'
import type {
  ArchiveView,
  AuthMode,
  Chapter,
  CommentItem,
  FandomStat,
  LayoutMode,
  PlatformStats,
  Profile,
  SortMode,
  WorkCardData,
  WorkDetail,
  WorkFilters,
} from '@/lib/types'
import { compactNumber, formatDate, fullNumber, ratingLabel } from '@/lib/format'
import { sanitizeStoryHtml } from '@/lib/writer-draft'

const PAGE_SIZE = 12
const EMPTY_STATS: PlatformStats = { works: 0, fandoms: 0, users: 0, words: 0 }
const EMPTY_FILTERS: WorkFilters = {
  fandom: '',
  rating: '',
  status: '',
  minWords: '',
  includeTag: '',
  excludeTag: '',
  hideExplicit: false,
}

function normalizeWork(row: Record<string, unknown>): WorkCardData {
  return {
    id: String(row.id || ''),
    creator_id: String(row.creator_id || ''),
    title: String(row.title || ''),
    summary: String(row.summary || ''),
    rating: String(row.rating || 'NOT_RATED') as WorkCardData['rating'],
    status: String(row.status || 'ONGOING') as WorkCardData['status'],
    visibility: String(row.visibility || 'PUBLIC') as WorkCardData['visibility'],
    language: String(row.language || 'pt-BR'),
    expected_chapters: row.expected_chapters == null ? null : Number(row.expected_chapters),
    word_count: Number(row.word_count || 0),
    chapter_count: Number(row.chapter_count || 0),
    kudos_count: Number(row.kudos_count || 0),
    bookmarks_count: Number(row.bookmarks_count || 0),
    comments_count: Number(row.comments_count || 0),
    hits_count: Number(row.hits_count || 0),
    allow_comments: Boolean(row.allow_comments),
    published_at: row.published_at ? String(row.published_at) : null,
    updated_at: String(row.updated_at || ''),
    created_at: String(row.created_at || ''),
    author_username: String(row.author_username || ''),
    author_display_name: String(row.author_display_name || row.author_username || ''),
    fandoms: Array.isArray(row.fandoms) ? row.fandoms.map(String) : [],
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    kudosed: Boolean(row.kudosed),
    bookmarked: Boolean(row.bookmarked),
    total_count: row.total_count == null ? undefined : Number(row.total_count),
  }
}

function normalizeChapter(row: Record<string, unknown>): Chapter {
  return {
    id: String(row.id || ''),
    work_id: String(row.work_id || ''),
    chapter_number: Number(row.chapter_number || 0),
    title: row.title == null ? null : String(row.title),
    content: String(row.content || ''),
    notes_before: row.notes_before == null ? null : String(row.notes_before),
    notes_after: row.notes_after == null ? null : String(row.notes_after),
    word_count: Number(row.word_count || 0),
    status: String(row.status || 'PUBLISHED') as Chapter['status'],
    published_at: row.published_at == null ? null : String(row.published_at),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function readFormString(form: FormData, key: string) {
  return String(form.get(key) || '').trim()
}

export function ArchiveNovaApp({ initialView = 'home' }: { initialView?: ArchiveView }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])

  const readerDialog = useRef<HTMLDialogElement>(null)
  const authDialog = useRef<HTMLDialogElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const [view, setView] = useState<ArchiveView>(initialView)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [stats, setStats] = useState<PlatformStats>(EMPTY_STATS)
  const [fandoms, setFandoms] = useState<FandomStat[]>([])
  const [featured, setFeatured] = useState<WorkCardData[]>([])
  const [results, setResults] = useState<WorkCardData[]>([])
  const [library, setLibrary] = useState<WorkCardData[]>([])
  const [history, setHistory] = useState<WorkCardData[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filters, setFilters] = useState<WorkFilters>(EMPTY_FILTERS)
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [layout, setLayout] = useState<LayoutMode>('grid')
  const [page, setPage] = useState(0)
  const [resultTotal, setResultTotal] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [reader, setReader] = useState<WorkDetail | null>(null)
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [readerFont, setReaderFont] = useState(19)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const currentChapter = reader?.chapters.find((chapter) => chapter.id === currentChapterId) || reader?.chapters[0] || null

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? '' : current), 2500)
  }, [])

  const loadProfile = useCallback(async (user: User | null) => {
    setAuthUser(user)
    if (!supabase || !user) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,bio,role,status')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error(error)
      setProfile(null)
      return
    }
    setProfile(data as Profile)
  }, [supabase])

  const loadStatsAndFandoms = useCallback(async () => {
    if (!supabase) return
    const [statsResponse, fandomResponse] = await Promise.all([
      supabase.rpc('platform_stats'),
      supabase.rpc('active_fandoms', { limit_count: 12 }),
    ])

    if (statsResponse.error) console.error(statsResponse.error)
    if (fandomResponse.error) console.error(fandomResponse.error)

    const rawStats = statsResponse.data as Record<string, unknown> | null
    setStats(rawStats ? {
      works: Number(rawStats.works || 0),
      fandoms: Number(rawStats.fandoms || 0),
      users: Number(rawStats.users || 0),
      words: Number(rawStats.words || 0),
    } : EMPTY_STATS)

    setFandoms(((fandomResponse.data || []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      work_count: Number(row.work_count || 0),
      total_words: Number(row.total_words || 0),
    })))
  }, [supabase])

  const runWorkSearch = useCallback(async ({
    search = debouncedQuery,
    filterState = filters,
    sort = sortMode,
    requestedPage = page,
    size = PAGE_SIZE,
  }: {
    search?: string
    filterState?: WorkFilters
    sort?: SortMode
    requestedPage?: number
    size?: number
  } = {}) => {
    if (!supabase) return { works: [] as WorkCardData[], total: 0 }

    const { data, error } = await supabase.rpc('search_works', {
      search_text: search || null,
      fandom_filter: filterState.fandom || null,
      rating_filter: filterState.rating || null,
      status_filter: filterState.status || null,
      min_words: filterState.minWords ? Number(filterState.minWords) : 0,
      include_tag: filterState.includeTag || null,
      exclude_tag: filterState.excludeTag || null,
      hide_explicit: filterState.hideExplicit,
      sort_mode: sort,
      page_size: size,
      page_offset: requestedPage * size,
    })

    if (error) throw error
    const works = ((data || []) as Record<string, unknown>[]).map(normalizeWork)
    const total = works[0]?.total_count || 0
    return { works, total }
  }, [supabase, debouncedQuery, filters, sortMode, page])

  const loadFeatured = useCallback(async () => {
    try {
      const { works } = await runWorkSearch({ search: '', filterState: EMPTY_FILTERS, sort: sortMode, requestedPage: 0, size: 6 })
      setFeatured(works)
    } catch (error) {
      console.error(error)
    }
  }, [runWorkSearch, sortMode])

  const loadResults = useCallback(async () => {
    setResultsLoading(true)
    try {
      const { works, total } = await runWorkSearch()
      setResults(works)
      setResultTotal(total)
    } catch (error) {
      console.error(error)
      notify('Não foi possível carregar as obras.')
    } finally {
      setResultsLoading(false)
    }
  }, [runWorkSearch, notify])

  const loadLibrary = useCallback(async () => {
    if (!supabase || !profile) return
    const { data, error } = await supabase.rpc('my_bookmarks', { limit_count: 100 })
    if (error) {
      console.error(error)
      notify('Não foi possível carregar sua biblioteca.')
      return
    }
    setLibrary(((data || []) as Record<string, unknown>[]).map((row) => ({ ...normalizeWork(row), bookmarked: true })))
  }, [supabase, profile, notify])

  const loadHistory = useCallback(async () => {
    if (!supabase || !profile) return
    const { data, error } = await supabase.rpc('my_history', { limit_count: 100 })
    if (error) {
      console.error(error)
      notify('Não foi possível carregar seu histórico.')
      return
    }
    setHistory(((data || []) as Record<string, unknown>[]).map(normalizeWork))
  }, [supabase, profile, notify])

  const refreshPublic = useCallback(async () => {
    await Promise.all([loadStatsAndFandoms(), loadFeatured()])
    if (view === 'explore') await loadResults()
  }, [loadStatsAndFandoms, loadFeatured, loadResults, view])

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('archiveNovaTheme')
    const nextTheme = savedTheme === 'dark' ? 'dark' : 'light'
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'login') {
      setAuthMode('login')
      setAuthError('')
      window.requestAnimationFrame(() => authDialog.current?.showModal())
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    const workId = new URLSearchParams(window.location.search).get('work')
    if (workId) window.requestAnimationFrame(() => void openWork(workId))
    // openWork is a function declaration and uses the current Supabase client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (active) void loadProfile(data.user)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void loadProfile(session?.user || null)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [supabase, loadProfile])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 260)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!supabase) return
    void loadStatsAndFandoms()
  }, [supabase, loadStatsAndFandoms])

  useEffect(() => {
    if (!supabase) return
    void loadFeatured()
  }, [supabase, loadFeatured])

  useEffect(() => {
    if (view === 'explore') void loadResults()
    if (view === 'library' && profile) void loadLibrary()
    if (view === 'history' && profile) void loadHistory()
  }, [view, profile, loadResults, loadLibrary, loadHistory, page, filters, debouncedQuery])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  function ensureConfigured() {
    if (configured && supabase) return true
    notify('Configure as variáveis do Supabase para ativar o site.')
    return false
  }

  function requireUser() {
    if (profile) return true
    if (!ensureConfigured()) return false
    setAuthMode('login')
    setAuthError('')
    authDialog.current?.showModal()
    notify('Entre na sua conta para continuar.')
    return false
  }

  function changeView(next: ArchiveView) {
    if ((next === 'library' || next === 'history') && !profile) {
      requireUser()
      return
    }
    setView(next)
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function chooseFandom(fandom: FandomStat) {
    setFilters((current) => ({ ...current, fandom: fandom.slug }))
    setPage(0)
    setView('explore')
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setQuery('')
    setDebouncedQuery('')
    setPage(0)
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    window.localStorage.setItem('archiveNovaTheme', next)
  }

  async function openWork(id: string) {
    if (!ensureConfigured() || !supabase) return
    try {
      const { data, error } = await supabase.rpc('get_work_detail', { target_work: id })
      if (error) throw error
      const raw = data as { work: Record<string, unknown>; chapters: Record<string, unknown>[] }
      const detail: WorkDetail = {
        work: normalizeWork(raw.work),
        chapters: (raw.chapters || []).map(normalizeChapter),
      }
      setReader(detail)
      setCurrentChapterId(detail.chapters[0]?.id || null)
      requestAnimationFrame(() => readerDialog.current?.showModal())
      void fetch(`/api/works/${id}/hit`, { method: 'POST' })
      if (profile) {
        void supabase.rpc('record_history', {
          target_work: id,
          target_chapter: detail.chapters[0]?.id || null,
        })
      }
    } catch (error) {
      console.error(error)
      notify('Não foi possível abrir essa obra.')
    }
  }

  const loadComments = useCallback(async () => {
    if (!supabase || !currentChapter) {
      setComments([])
      return
    }
    const { data, error } = await supabase
      .from('comments')
      .select('id,chapter_id,user_id,parent_id,body,status,created_at,updated_at,profile:profiles!comments_user_id_fkey(username,display_name)')
      .eq('chapter_id', currentChapter.id)
      .eq('status', 'VISIBLE')
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      setComments([])
      return
    }

    setComments(((data || []) as unknown as CommentItem[]).map((item) => ({
      ...item,
      profile: Array.isArray(item.profile) ? item.profile[0] : item.profile,
    })))
  }, [supabase, currentChapter])

  useEffect(() => {
    if (readerDialog.current?.open && currentChapter) void loadComments()
  }, [currentChapter, loadComments])

  async function refreshReader() {
    if (!supabase || !reader) return
    const current = currentChapterId
    const { data, error } = await supabase.rpc('get_work_detail', { target_work: reader.work.id })
    if (error) return
    const raw = data as { work: Record<string, unknown>; chapters: Record<string, unknown>[] }
    const detail: WorkDetail = { work: normalizeWork(raw.work), chapters: (raw.chapters || []).map(normalizeChapter) }
    setReader(detail)
    setCurrentChapterId(detail.chapters.some((chapter) => chapter.id === current) ? current : detail.chapters[0]?.id || null)
  }

  async function toggleBookmark(work: WorkCardData) {
    if (!requireUser() || !supabase) return
    try {
      const { error } = await supabase.rpc('toggle_bookmark', { target_work: work.id })
      if (error) throw error
      notify(work.bookmarked ? 'Bookmark removido.' : 'Bookmark salvo.')
      await Promise.all([refreshPublic(), loadLibrary()])
      if (reader?.work.id === work.id) await refreshReader()
    } catch (error) {
      console.error(error)
      notify('Não foi possível alterar o bookmark.')
    }
  }

  async function toggleReaderBookmark() {
    if (!reader) return
    await toggleBookmark(reader.work)
  }

  async function toggleReaderKudos() {
    if (!reader || !requireUser() || !supabase) return
    try {
      const before = reader.work.kudosed
      const { error } = await supabase.rpc('toggle_kudos', { target_work: reader.work.id })
      if (error) throw error
      notify(before ? 'Kudos removido.' : 'Kudos enviado.')
      await Promise.all([refreshReader(), refreshPublic()])
    } catch (error) {
      console.error(error)
      notify('Não foi possível alterar seu kudos.')
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!currentChapter || !reader || !requireUser() || !supabase || !profile) return
    const form = new FormData(formElement)
    const body = readFormString(form, 'comment')
    if (!body) return

    setBusy(true)
    const { error } = await supabase.from('comments').insert({
      chapter_id: currentChapter.id,
      user_id: profile.id,
      body,
    })
    setBusy(false)

    if (error) {
      console.error(error)
      notify('Não foi possível publicar o comentário.')
      return
    }
    formElement.reset()
    await Promise.all([loadComments(), refreshReader()])
    notify('Comentário publicado.')
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!ensureConfigured() || !supabase) return
    const form = new FormData(formElement)
    setBusy(true)
    setAuthError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: readFormString(form, 'email'),
        password: String(form.get('password') || ''),
      })

      if (error) {
        console.error('Erro de login:', error)
        if (error.code === 'email_not_confirmed') {
          setAuthError('Seu e-mail ainda não foi confirmado. Abra o e-mail enviado pelo ArchiveNova e confirme sua conta.')
        } else if (error.code === 'invalid_credentials') {
          setAuthError('E-mail ou senha incorretos.')
        } else {
          setAuthError(error.message || 'Não foi possível entrar na sua conta.')
        }
        return
      }

      formElement.reset()
      authDialog.current?.close()
      notify('Você entrou na sua conta.')
      const returnTo = new URLSearchParams(window.location.search).get('return')
      if (returnTo?.startsWith('/')) window.location.href = returnTo
    } catch (error) {
      console.error('Erro inesperado no login:', error)
      setAuthError('Ocorreu um erro inesperado ao entrar.')
    } finally {
      setBusy(false)
    }
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!ensureConfigured() || !supabase) return
    const form = new FormData(formElement)
    const username = readFormString(form, 'username')
    const email = readFormString(form, 'email')
    const password = String(form.get('password') || '')
    const displayName = readFormString(form, 'displayName')

    if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) {
      setAuthError('O usuário deve ter de 3 a 40 caracteres: letras, números ou _.')
      return
    }

    setBusy(true)
    setAuthError('')

    try {
      const availability = await supabase.rpc('is_username_available', { candidate: username })
      if (availability.error || availability.data !== true) {
        setAuthError(availability.error?.message || 'Esse nome de usuário já está em uso.')
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username, display_name: displayName || null },
        },
      })

      if (error) {
        console.error('Erro ao criar conta:', error)
        setAuthError(error.message || 'Não foi possível criar sua conta.')
        return
      }

      formElement.reset()
      if (data.session) {
        authDialog.current?.close()
        notify('Conta criada e conectada.')
        const returnTo = new URLSearchParams(window.location.search).get('return')
        if (returnTo?.startsWith('/')) window.location.href = returnTo
      } else {
        setAuthError('Conta criada. Confira seu e-mail para confirmar o cadastro.')
      }
    } catch (error) {
      console.error('Erro inesperado no cadastro:', error)
      setAuthError('Ocorreu um erro inesperado ao criar sua conta.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    if (!supabase) return
    await supabase.auth.signOut()
    authDialog.current?.close()
    setProfile(null)
    setAuthUser(null)
    if (view === 'library' || view === 'history') setView('home')
    notify('Você saiu da conta.')
  }

  async function randomWork() {
    if (!ensureConfigured() || !supabase) return
    const { data, error } = await supabase.rpc('random_public_work')
    if (error || !data) {
      notify('Ainda não existem obras públicas no arquivo.')
      return
    }
    await openWork(String(data))
  }

  function updateFilter<K extends keyof WorkFilters>(key: K, value: WorkFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(0)
  }

  function updateSort(mode: SortMode) {
    setSortMode(mode)
    setPage(0)
  }

  function clearSingleFilter(key: keyof WorkFilters) {
    if (key === 'hideExplicit') updateFilter(key, false)
    else updateFilter(key, '' as WorkFilters[typeof key])
  }

  const activeFilterCount = useMemo(() => {
    return [
      filters.fandom,
      filters.rating,
      filters.status,
      filters.minWords,
      filters.includeTag,
      filters.excludeTag,
      filters.hideExplicit ? '1' : '',
    ].filter(Boolean).length
  }, [filters])

  const fandomLabel = filters.fandom
    ? fandoms.find((fandom) => fandom.slug === filters.fandom || fandom.name === filters.fandom)?.name || filters.fandom
    : ''

  const ratingLabels: Record<string, string> = {
    GENERAL: 'Livre',
    TEEN: 'Teen',
    MATURE: 'Mature',
    EXPLICIT: 'Explicit',
    NOT_RATED: 'Não classificada',
  }

  const statusLabels: Record<string, string> = { COMPLETE: 'Concluída', ONGOING: 'Em andamento', HIATUS: 'Hiato' }

  const chapterParagraphs = currentChapter?.content.split(/\n\s*\n/).filter(Boolean) || []
  const totalPages = Math.max(1, Math.ceil(resultTotal / PAGE_SIZE))
  const isOwner = Boolean(profile && reader && reader.work.creator_id === profile.id)

  return (
    <>
      <a className="skip-link" href="#main">Pular para o conteúdo</a>
      {!configured && (
        <div className="setup-banner">
          <strong>Supabase ainda não configurado.</strong> O layout está ativo, mas o banco permanece desconectado até você preencher <code>.env.local</code>.
        </div>
      )}

      <div className="app-shell">
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Navegação principal">
          <Link className="brand brand-link" href="/" aria-label="Voltar para a página inicial">
            <div className="brand-mark" aria-hidden="true">✦</div>
            <div><strong>Archive Nova</strong><span>histórias, bem organizadas</span></div>
          </Link>

          <nav className="nav-stack">
            <Link className="nav-item" href="/"><span>⌂</span> Início</Link>
            <button className={`nav-item ${view === 'explore' ? 'active' : ''}`} onClick={() => changeView('explore')}><span>⌕</span> Explorar</button>
            <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => changeView('library')}><span>♡</span> Minha biblioteca</button>
            <button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => changeView('history')}><span>↺</span> Histórico</button>
            <Link className="nav-item" href="/dashboard"><span>◫</span> Creator Studio</Link>
            <Link className="nav-item" href="/notifications"><span>♢</span> Notificações</Link>
          </nav>

          <div className="sidebar-section">
            <p className="eyebrow">Fandoms ativos</p>
            <div className="dynamic-links">
              {fandoms.length ? fandoms.slice(0, 6).map((fandom) => (
                <button className="mini-link" key={fandom.id} onClick={() => chooseFandom(fandom)}>{fandom.name}</button>
              )) : <span className="muted-small">Nenhum fandom publicado ainda.</span>}
            </div>
          </div>

          <div className="sidebar-bottom">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Alternar tema">
              <span>{theme === 'dark' ? '☀' : '☾'}</span><span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
            </button>
            <button className="profile-mini profile-button" onClick={() => { if (profile) { window.location.href = `/users/${encodeURIComponent(profile.username)}`; return } setAuthError(''); authDialog.current?.showModal() }}>
              <div className="avatar">{profile?.username?.slice(0, 1).toUpperCase() || '?'}</div>
              <div>
                <strong>{profile?.display_name || profile?.username || 'Entrar'}</strong>
                <span>{profile ? `@${profile.username}` : 'criar uma conta'}</span>
              </div>
              <span aria-hidden="true">•••</span>
            </button>
          </div>
        </aside>

        <main className="main" id="main">
          <header className="topbar">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen((value) => !value)} aria-label="Abrir menu">☰</button>
            <div className="global-search">
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchInput}
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(0); setView('explore') }}
                placeholder="Buscar obras, autores, fandoms ou tags…"
                autoComplete="off"
              />
              <kbd>Ctrl K</kbd>
            </div>
            <button className="secondary-button" onClick={() => { setView('explore'); setFiltersOpen((value) => !value) }}>Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>
            <button className="primary-button" onClick={() => { window.location.href = '/write' }}>＋ Escrever</button>
          </header>

          <section className={`view ${view === 'home' ? 'active' : ''}`}>
            <section className="hero">
              <div className="hero-copy">
                <span className="pill soft">Arquivo comunitário independente</span>
                <h1>Encontre uma história que pareça ter sido escrita <em>para você.</em></h1>
                <p>Busca detalhada, tags legíveis, leitura confortável e uma biblioteca organizada. Todo conteúdo mostrado aqui vem do banco de dados do próprio Archive Nova.</p>
                <div className="hero-actions">
                  <button className="primary-button large" onClick={() => changeView('explore')}>Explorar histórias</button>
                  <button className="ghost-button large" onClick={randomWork}>Obra aleatória</button>
                </div>
              </div>
              <div className="hero-card" aria-label="Resumo da plataforma">
                <div className="stat"><strong>{fullNumber(stats.works)}</strong><span>obras públicas</span></div>
                <div className="stat"><strong>{fullNumber(stats.fandoms)}</strong><span>fandoms</span></div>
                <div className="stat"><strong>{fullNumber(stats.users)}</strong><span>contas ativas</span></div>
                <div className="hero-note">{fullNumber(stats.words)} palavras publicadas no arquivo.</div>
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">Descoberta</p><h2>Fandoms mais ativos</h2></div>
                <button className="text-button" onClick={() => changeView('explore')}>Explorar obras →</button>
              </div>
              {fandoms.length ? (
                <div className="category-grid">
                  {fandoms.slice(0, 8).map((fandom) => (
                    <button className="category-card" key={fandom.id} onClick={() => chooseFandom(fandom)}>
                      <span className="category-icon">✦</span>
                      <strong>{fandom.name}</strong>
                      <span>{fullNumber(fandom.work_count)} obras · {compactNumber(fandom.total_words)} palavras</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state centered compact-empty"><span>✦</span><h2>O arquivo ainda está vazio</h2><p>O primeiro fandom aparecerá aqui assim que uma obra for publicada.</p></div>
              )}
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div><p className="eyebrow">Acervo</p><h2>Obras</h2></div>
                <div className="segmented" role="group" aria-label="Ordenar obras">
                  {(['hot', 'recent', 'long'] as SortMode[]).map((mode) => (
                    <button key={mode} className={sortMode === mode ? 'active' : ''} onClick={() => setSortMode(mode)}>
                      {mode === 'hot' ? 'Em alta' : mode === 'recent' ? 'Recentes' : 'Longas'}
                    </button>
                  ))}
                </div>
              </div>
              {featured.length ? (
                <div className="work-grid">{featured.map((work) => <WorkCard key={work.id} work={work} onOpen={openWork} onBookmark={toggleBookmark} />)}</div>
              ) : (
                <div className="empty-state centered compact-empty"><span>⌁</span><h2>Nenhuma obra publicada</h2><p>Cadastre-se e publique a primeira obra do arquivo.</p></div>
              )}
            </section>
          </section>

          <section className={`view explore-view ${view === 'explore' ? 'active' : ''}`}>
            <div className="explore-hero-v4">
              <div className="explore-title-row">
                <div>
                  <p className="eyebrow">Descoberta</p>
                  <h1>Encontre sua próxima história.</h1>
                  <p>Pesquise por título, autor, fandom ou tag e refine sem transformar a busca em um formulário gigante.</p>
                </div>
                <div className="explore-result-badge" aria-live="polite">
                  <strong>{resultsLoading ? '…' : fullNumber(resultTotal)}</strong>
                  <span>{resultTotal === 1 ? 'obra encontrada' : 'obras encontradas'}</span>
                </div>
              </div>

              <div className="explore-search-box">
                <span className="explore-search-icon" aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setPage(0) }}
                  placeholder="Busque uma obra, autor, fandom ou tag…"
                  autoComplete="off"
                  aria-label="Buscar no acervo"
                />
                {query ? <button type="button" className="explore-search-clear" onClick={() => { setQuery(''); setDebouncedQuery(''); setPage(0) }} aria-label="Limpar busca">×</button> : <span className="explore-search-hint">Ctrl K</span>}
              </div>

              <div className="explore-quick-row" aria-label="Filtros rápidos">
                <button className={!filters.status && !filters.minWords ? 'active' : ''} onClick={() => { updateFilter('status', ''); updateFilter('minWords', '') }}>Todas</button>
                <button className={filters.status === 'COMPLETE' ? 'active' : ''} onClick={() => updateFilter('status', filters.status === 'COMPLETE' ? '' : 'COMPLETE')}>✓ Concluídas</button>
                <button className={filters.status === 'ONGOING' ? 'active' : ''} onClick={() => updateFilter('status', filters.status === 'ONGOING' ? '' : 'ONGOING')}>↗ Em andamento</button>
                <button className={filters.minWords === '50000' ? 'active' : ''} onClick={() => updateFilter('minWords', filters.minWords === '50000' ? '' : '50000')}>50 mil+ palavras</button>
                <button className={filters.hideExplicit ? 'active' : ''} onClick={() => updateFilter('hideExplicit', !filters.hideExplicit)}>Sem Explicit</button>
              </div>
            </div>

            <div className="explore-toolbar-v4">
              <div className="explore-toolbar-left">
                <button className={`filter-trigger ${filtersOpen ? 'active' : ''}`} onClick={() => setFiltersOpen((value) => !value)}>
                  <span>☷</span> Filtros {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
                </button>
                <div className="sort-control">
                  <span>Ordenar</span>
                  <select value={sortMode} onChange={(event) => updateSort(event.target.value as SortMode)} aria-label="Ordenar resultados">
                    <option value="recent">Mais recentes</option>
                    <option value="hot">Em alta</option>
                    <option value="long">Mais longas</option>
                  </select>
                </div>
              </div>
              <div className="view-tools explore-view-tools">
                <button className={`icon-button ${layout === 'grid' ? 'active' : ''}`} onClick={() => setLayout('grid')} aria-label="Visualização em grade">▦</button>
                <button className={`icon-button ${layout === 'list' ? 'active' : ''}`} onClick={() => setLayout('list')} aria-label="Visualização em lista">☷</button>
              </div>
            </div>

            {(activeFilterCount > 0 || debouncedQuery) && (
              <div className="active-filter-bar">
                <span className="active-filter-label">Ativos</span>
                {debouncedQuery && <button onClick={() => { setQuery(''); setDebouncedQuery(''); setPage(0) }}>Busca: “{debouncedQuery}” <span>×</span></button>}
                {filters.fandom && <button onClick={() => clearSingleFilter('fandom')}>Fandom: {fandomLabel} <span>×</span></button>}
                {filters.rating && <button onClick={() => clearSingleFilter('rating')}>{ratingLabels[filters.rating] || filters.rating} <span>×</span></button>}
                {filters.status && <button onClick={() => clearSingleFilter('status')}>{statusLabels[filters.status] || filters.status} <span>×</span></button>}
                {filters.minWords && <button onClick={() => clearSingleFilter('minWords')}>{fullNumber(Number(filters.minWords))}+ palavras <span>×</span></button>}
                {filters.includeTag && <button onClick={() => clearSingleFilter('includeTag')}>Tag: {filters.includeTag} <span>×</span></button>}
                {filters.excludeTag && <button onClick={() => clearSingleFilter('excludeTag')}>Excluir: {filters.excludeTag} <span>×</span></button>}
                {filters.hideExplicit && <button onClick={() => clearSingleFilter('hideExplicit')}>Sem Explicit <span>×</span></button>}
                <button className="clear-filter-chip" onClick={clearFilters}>Limpar tudo</button>
              </div>
            )}

            <div className={`explore-layout-v4 ${filtersOpen ? 'filters-visible' : ''}`}>
              {filtersOpen && <button className="filters-backdrop" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)} />}
              <aside className={`filters-panel-v4 ${filtersOpen ? 'open' : ''}`} aria-label="Filtros de busca">
                <div className="filters-v4-head">
                  <div><p className="eyebrow">Refinar</p><h2>Filtros</h2></div>
                  <div className="filters-v4-head-actions"><button className="text-button" onClick={clearFilters}>Limpar</button><button className="filter-close" onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros">×</button></div>
                </div>

                <div className="filter-group-v4">
                  <div className="filter-group-title"><strong>Fandom</strong><span>{fandomLabel || 'Todos'}</span></div>
                  <div className="filter-choice-list fandom-choice-list">
                    <button className={!filters.fandom ? 'active' : ''} onClick={() => updateFilter('fandom', '')}>Todos</button>
                    {fandoms.slice(0, 10).map((fandom) => <button key={fandom.id} className={filters.fandom === fandom.slug ? 'active' : ''} onClick={() => updateFilter('fandom', filters.fandom === fandom.slug ? '' : fandom.slug)}>{fandom.name}<small>{fullNumber(fandom.work_count)}</small></button>)}
                  </div>
                </div>

                <div className="filter-group-v4">
                  <div className="filter-group-title"><strong>Classificação</strong><span>{filters.rating ? ratingLabels[filters.rating] : 'Todas'}</span></div>
                  <div className="rating-filter-grid">
                    {[['GENERAL','G','Livre'],['TEEN','T','Teen'],['MATURE','M','Mature'],['EXPLICIT','E','Explicit'],['NOT_RATED','?','Não classificada']].map(([value, short, label]) => (
                      <button key={value} className={filters.rating === value ? 'active' : ''} onClick={() => updateFilter('rating', filters.rating === value ? '' : value)}><b>{short}</b><span>{label}</span></button>
                    ))}
                  </div>
                </div>

                <div className="filter-group-v4">
                  <div className="filter-group-title"><strong>Status</strong><span>{filters.status ? statusLabels[filters.status] : 'Todos'}</span></div>
                  <div className="filter-choice-list compact">
                    <button className={!filters.status ? 'active' : ''} onClick={() => updateFilter('status', '')}>Todos</button>
                    <button className={filters.status === 'ONGOING' ? 'active' : ''} onClick={() => updateFilter('status', filters.status === 'ONGOING' ? '' : 'ONGOING')}>Em andamento</button>
                    <button className={filters.status === 'COMPLETE' ? 'active' : ''} onClick={() => updateFilter('status', filters.status === 'COMPLETE' ? '' : 'COMPLETE')}>Concluída</button>
                    <button className={filters.status === 'HIATUS' ? 'active' : ''} onClick={() => updateFilter('status', filters.status === 'HIATUS' ? '' : 'HIATUS')}>Hiato</button>
                  </div>
                </div>

                <div className="filter-group-v4">
                  <div className="filter-group-title"><strong>Tamanho mínimo</strong><span>{filters.minWords ? `${fullNumber(Number(filters.minWords))}+` : 'Qualquer'}</span></div>
                  <div className="word-presets">
                    {[['','Qualquer'],['1000','1k+'],['10000','10k+'],['50000','50k+'],['100000','100k+']].map(([value, label]) => <button key={label} className={filters.minWords === value ? 'active' : ''} onClick={() => updateFilter('minWords', value)}>{label}</button>)}
                  </div>
                  <label className="filter-input-label">Ou digite o mínimo
                    <input type="number" min="0" step="1000" value={filters.minWords} onChange={(event) => updateFilter('minWords', event.target.value)} placeholder="Ex.: 25000" />
                  </label>
                </div>

                <div className="filter-group-v4">
                  <div className="filter-group-title"><strong>Tags</strong><span>Inclua ou evite</span></div>
                  <label className="filter-input-label">Incluir tag
                    <input value={filters.includeTag} onChange={(event) => updateFilter('includeTag', event.target.value)} placeholder="Ex.: Slow Burn" />
                  </label>
                  <label className="filter-input-label">Excluir tag
                    <input value={filters.excludeTag} onChange={(event) => updateFilter('excludeTag', event.target.value)} placeholder="Ex.: Major Character Death" />
                  </label>
                </div>

                <label className="explicit-toggle-v4">
                  <span><strong>Ocultar Explicit</strong><small>Remove obras classificadas como conteúdo explícito.</small></span>
                  <input type="checkbox" checked={filters.hideExplicit} onChange={(event) => updateFilter('hideExplicit', event.target.checked)} />
                  <i aria-hidden="true" />
                </label>

                <button className="primary-button filter-mobile-done" onClick={() => setFiltersOpen(false)}>Ver {fullNumber(resultTotal)} resultados</button>
              </aside>

              <div className="results-pane-v4">
                <div className="results-status-line" aria-live="polite">
                  <span>{resultsLoading ? 'Atualizando resultados…' : debouncedQuery ? <>Resultados para <strong>“{debouncedQuery}”</strong></> : 'Todo o acervo público'}</span>
                  {activeFilterCount > 0 && <span>{activeFilterCount} filtro{activeFilterCount === 1 ? '' : 's'} aplicado{activeFilterCount === 1 ? '' : 's'}</span>}
                </div>
                {resultsLoading && results.length === 0 ? (
                  <div className="search-skeleton-grid" aria-label="Carregando obras">{Array.from({ length: 6 }).map((_, index) => <div className="search-skeleton-card" key={index}><span /><b /><i /><i /></div>)}</div>
                ) : results.length ? (
                  <div className={`work-grid ${layout === 'list' ? 'list' : ''} ${resultsLoading ? 'results-refreshing' : ''}`}>{results.map((work) => <WorkCard key={work.id} work={work} onOpen={openWork} onBookmark={toggleBookmark} />)}</div>
                ) : (
                  <div className="empty-state centered explore-empty"><span>⌕</span><h2>Nenhuma história por aqui</h2><p>Tente remover um filtro, buscar outro termo ou explorar um fandom diferente.</p><button className="secondary-button" onClick={clearFilters}>Limpar busca e filtros</button></div>
                )}
                {resultTotal > PAGE_SIZE && (
                  <div className="pager pager-v4">
                    <button className="secondary-button" disabled={page <= 0} onClick={() => { setPage((value) => Math.max(0, value - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>← Anterior</button>
                    <div><strong>{page + 1}</strong><span>de {totalPages}</span></div>
                    <button className="secondary-button" disabled={page + 1 >= totalPages} onClick={() => { setPage((value) => value + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Próxima →</button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={`view ${view === 'library' ? 'active' : ''}`}>
            <div className="page-header"><div><p className="eyebrow">Sua conta</p><h1>Minha biblioteca</h1><p>Bookmarks salvos na sua conta.</p></div></div>
            {library.length ? <div className="work-grid">{library.map((work) => <WorkCard key={work.id} work={work} onOpen={openWork} onBookmark={toggleBookmark} />)}</div> : <div className="empty-state centered compact-empty"><span>♡</span><h2>Nenhum bookmark</h2><p>Salve uma obra e ela aparecerá aqui.</p></div>}
          </section>

          <section className={`view ${view === 'history' ? 'active' : ''}`}>
            <div className="page-header"><div><p className="eyebrow">Sua conta</p><h1>Histórico de leitura</h1><p>Obras abertas enquanto você estava conectado.</p></div></div>
            {history.length ? <div className="work-grid">{history.map((work) => <WorkCard key={work.id} work={work} onOpen={openWork} onBookmark={toggleBookmark} />)}</div> : <div className="empty-state centered compact-empty"><span>↺</span><h2>Histórico vazio</h2><p>Abra uma obra e ela aparecerá aqui.</p></div>}
          </section>
        </main>
      </div>

      <dialog ref={readerDialog} className="reader-dialog" onClose={() => { setReader(null); setCurrentChapterId(null); setComments([]) }}>
        <div className="reader-toolbar">
          <button className="icon-button" onClick={() => readerDialog.current?.close()} aria-label="Fechar">←</button>
          <div className="reader-title">
            <strong>{reader?.work.title || ''}</strong>
            <span>{reader ? `${reader.work.author_display_name} • ${(reader.work.fandoms || []).join(', ')} • ${fullNumber(reader.work.word_count)} palavras` : ''}</span>
          </div>
          <div className="reader-actions">
            <button className="icon-button" onClick={() => setReaderFont((value) => Math.max(14, value - 1))} aria-label="Diminuir fonte">A−</button>
            <button className="icon-button" onClick={() => setReaderFont((value) => Math.min(30, value + 1))} aria-label="Aumentar fonte">A＋</button>
            <button className={`icon-button ${reader?.work.kudosed ? 'active' : ''}`} onClick={toggleReaderKudos} aria-label="Dar kudos">{reader?.work.kudosed ? '♥' : '♡'}</button>
            <button className={`icon-button ${reader?.work.bookmarked ? 'active' : ''}`} onClick={toggleReaderBookmark} aria-label="Adicionar bookmark">{reader?.work.bookmarked ? '★' : '☆'}</button>
          </div>
        </div>

        {reader && (
          <>
            <div className="chapter-nav">
              <label>Capítulo
                <select
                  value={currentChapterId || ''}
                  onChange={(event) => {
                    const next = event.target.value
                    setCurrentChapterId(next)
                    if (profile && supabase) void supabase.rpc('record_history', { target_work: reader.work.id, target_chapter: next })
                  }}
                >
                  {reader.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.chapter_number}. {chapter.title || `Capítulo ${chapter.chapter_number}`}</option>)}
                </select>
              </label>
              <div className="reader-page-links"><Link className="secondary-button reader-manage-link" href={`/works/${reader.work.id}`} onClick={() => readerDialog.current?.close()}>↗ Página da obra</Link>{isOwner && <Link className="secondary-button reader-manage-link" href={`/works/${reader.work.id}/manage`} onClick={() => readerDialog.current?.close()}>⚙ Gerenciar obra</Link>}</div>
            </div>

            <article className="reader-content" style={{ '--reader-size': `${readerFont}px` } as CSSProperties}>
              <h1>{reader.work.title}</h1>
              <div className="byline">por <Link href={`/users/${encodeURIComponent(reader.work.author_username)}`} onClick={() => readerDialog.current?.close()}>{reader.work.author_display_name}</Link> • {ratingLabel(reader.work.rating)} • {reader.work.tags.join(' · ')}</div>
              {currentChapter ? (
                <>
                  {currentChapter.title && <h2>{currentChapter.title}</h2>}
                  {currentChapter.notes_before && <aside className="chapter-note">{currentChapter.notes_before}</aside>}
                  {/<\/?(?:p|h[1-3]|ul|ol|li|blockquote|strong|em|u|s|hr|br)\b/i.test(currentChapter.content) ? (
                    <div className="reader-rich-text" dangerouslySetInnerHTML={{ __html: sanitizeStoryHtml(currentChapter.content) }} />
                  ) : (
                    chapterParagraphs.map((paragraph, index) => <p key={`${currentChapter.id}-${index}`}>{paragraph.split('\n').map((line, lineIndex) => <span key={lineIndex}>{line}{lineIndex < paragraph.split('\n').length - 1 && <br />}</span>)}</p>)
                  )}
                  {currentChapter.notes_after && <aside className="chapter-note">{currentChapter.notes_after}</aside>}
                </>
              ) : <p>Esta obra ainda não possui capítulos publicados.</p>}
            </article>

            <section className="comments-panel">
              <div className="comments-head"><h2>Comentários</h2><span>{fullNumber(comments.length)}</span></div>
              {profile && reader.work.allow_comments ? (
                <form className="comment-form" onSubmit={submitComment}>
                  <textarea name="comment" required maxLength={20000} rows={3} placeholder="Escreva um comentário…" />
                  <button className="primary-button" disabled={busy}>Comentar</button>
                </form>
              ) : (
                <p className="muted-small">{reader.work.allow_comments ? 'Entre na sua conta para comentar.' : 'Comentários desativados pelo autor.'}</p>
              )}
              <div>
                {comments.length ? comments.map((comment) => (
                  <article className="comment-card" key={comment.id}>
                    <div className="comment-meta">
                      <strong>{comment.profile?.display_name || comment.profile?.username || 'Usuário'}</strong>
                      {comment.profile?.username && <span>@{comment.profile.username}</span>}
                      <time>{formatDate(comment.created_at)}</time>
                    </div>
                    <p>{comment.body}</p>
                  </article>
                )) : <p className="comments-empty">Nenhum comentário neste capítulo.</p>}
              </div>
            </section>
          </>
        )}
      </dialog>

      <dialog ref={authDialog} className="publish-dialog auth-dialog">
        <div className="auth-shell">
          <div className="modal-head"><div><p className="eyebrow">Conta</p><h2>{profile ? (profile.display_name || profile.username) : authMode === 'login' ? 'Entrar' : 'Criar conta'}</h2></div><button type="button" className="icon-button" onClick={() => authDialog.current?.close()} aria-label="Fechar">×</button></div>
          {profile ? (
            <>
              <p className="account-summary">Conectado como <strong>@{profile.username}</strong>{authUser?.email ? ` · ${authUser.email}` : ''}</p>
              <button className="ghost-button full-width" type="button" onClick={logout}>Sair da conta</button>
            </>
          ) : (
            <>
              <div className="auth-tabs"><button className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError('') }}>Entrar</button><button className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setAuthError('') }}>Criar conta</button></div>
              {authMode === 'login' ? (
                <form className="auth-form" onSubmit={submitLogin}>
                  <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
                  <label>Senha<input name="password" type="password" required autoComplete="current-password" /></label>
                  <button className="primary-button" disabled={busy} type="submit">Entrar</button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={submitRegister}>
                  <label>Nome de usuário<input name="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9_]+" autoComplete="username" /></label>
                  <label>Nome exibido <span className="muted-small">opcional</span><input name="displayName" maxLength={80} /></label>
                  <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
                  <label>Senha<input name="password" type="password" minLength={10} maxLength={120} required autoComplete="new-password" /></label>
                  <button className="primary-button" disabled={busy} type="submit">Criar conta</button>
                </form>
              )}
              <p className="form-error">{authError}</p>
            </>
          )}
        </div>
      </dialog>

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </>
  )
}
