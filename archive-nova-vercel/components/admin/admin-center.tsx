'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { useNovaConfirm } from '@/components/ui/nova-confirm'

type AdminSection =
  | 'overview'
  | 'users'
  | 'moderation'
  | 'content'
  | 'taxonomy'
  | 'ads'
  | 'faq'
  | 'support'
  | 'audit'
  | 'analytics'
  | 'health'
  | 'settings'

type DashboardPayload = {
  users?: { total?: number; active?: number; suspended?: number; moderators?: number; admins?: number }
  content?: { works?: number; public_works?: number; drafts?: number; posts?: number; comments?: number }
  trust?: { open_reports?: number; open_ad_requests?: number; active_campaigns?: number }
  activity?: { users_24h?: number; works_24h?: number; posts_24h?: number; hits_24h?: number }
}

type AdminUser = {
  id: string
  username: string
  display_name: string | null
  email: string | null
  role: 'USER' | 'MODERATOR' | 'ADMIN'
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
  created_at: string
  updated_at: string
  works_count: number
  posts_count: number
  reports_count: number
}

type AdminWork = {
  id: string
  title: string
  status: string
  visibility: string
  deleted_at: string | null
  updated_at: string
  author_username: string
}

type AdminPost = {
  id: string
  body: string
  deleted_at: string | null
  created_at: string
  author_username: string
}

type AdminComment = {
  id: string
  body: string
  status: string
  created_at: string
  author_username: string
  kind: 'WORK' | 'POST'
}

type ContentPayload = {
  works?: AdminWork[]
  posts?: AdminPost[]
  comments?: AdminComment[]
}

type TaxonomyItem = {
  id: string
  name: string
  slug: string
  type?: string
  canonical: boolean
  description: string | null
  work_count: number
}

type TaxonomyPayload = {
  fandoms?: TaxonomyItem[]
  tags?: TaxonomyItem[]
}

type AuditItem = {
  id: number
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor_username: string | null
  actor_display_name: string | null
}

type AnalyticsDay = {
  date: string
  users: number
  works: number
  posts: number
  reports: number
  hits: number
}

type AdminSettings = {
  announcement_enabled: boolean
  announcement_text: string | null
  allow_new_ad_requests: boolean
  updated_at?: string
}

type FeatureFlag = {
  key: string
  enabled: boolean
  description: string | null
  updated_at: string
}

type HealthPayload = {
  database?: { size_bytes?: number; public_tables?: number; public_functions?: number; latest_migration?: string | null }
  security?: { rls_tables_without_policies?: number; suspended_users?: number; rate_events_1h?: number }
  content?: { public_works?: number; open_reports?: number; scheduled_chapters?: number }
}

const NAV: Array<{ key: AdminSection; label: string; group?: string }> = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'users', label: 'Usuários' },
  { key: 'moderation', label: 'Moderação' },
  { key: 'content', label: 'Conteúdo' },
  { key: 'taxonomy', label: 'Taxonomia' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'ads', label: 'Publicidade', group: 'Operação' },
  { key: 'faq', label: 'FAQ' },
  { key: 'support', label: 'Apoio' },
  { key: 'audit', label: 'Audit Log', group: 'Sistema' },
  { key: 'health', label: 'Saúde & flags' },
  { key: 'settings', label: 'Configurações' },
]

function fmt(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0))
}

function dateTime(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function sectionTitle(section: AdminSection) {
  return NAV.find((item) => item.key === section)?.label || 'Admin Center'
}

export function AdminCenter({ section }: { section: string }) {
  const currentSection = (NAV.some((item) => item.key === section) ? section : 'overview') as AdminSection
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const { ask, dialog } = useNovaConfirm()

  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('USER')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [dashboard, setDashboard] = useState<DashboardPayload>({})
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [content, setContent] = useState<ContentPayload>({})
  const [taxonomy, setTaxonomy] = useState<TaxonomyPayload>({})
  const [taxonomyQuery, setTaxonomyQuery] = useState('')
  const [editingTaxonomy, setEditingTaxonomy] = useState<{ kind: 'fandom' | 'tag'; id: string; name: string } | null>(null)
  const [mergeSource, setMergeSource] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [audit, setAudit] = useState<AuditItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsDay[]>([])
  const [health, setHealth] = useState<HealthPayload>({})
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [settings, setSettings] = useState<AdminSettings>({
    announcement_enabled: false,
    announcement_text: '',
    allow_new_ad_requests: true,
  })

  function flash(value: string) {
    setMessage(value)
    window.setTimeout(() => setMessage((current) => current === value ? '' : current), 3200)
  }

  async function requireAdmin() {
    if (!supabase) return false
    const current = (await supabase.auth.getUser()).data.user || null
    setUser(current)
    if (!current) {
      setRole('USER')
      return false
    }
    const { data } = await supabase.from('profiles').select('role').eq('id', current.id).maybeSingle()
    const nextRole = String(data?.role || 'USER')
    setRole(nextRole)
    return nextRole === 'ADMIN'
  }

  async function loadDashboard() {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('admin_dashboard')
    if (rpcError) throw rpcError
    setDashboard((data || {}) as DashboardPayload)
  }

  async function loadUsers(query = userQuery) {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('admin_users', {
      search_text: query,
      limit_count: 100,
      offset_count: 0,
    })
    if (rpcError) throw rpcError
    setUsers((data || []) as AdminUser[])
  }

  async function loadContent() {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('admin_content', { limit_count: 80 })
    if (rpcError) throw rpcError
    setContent((data || {}) as ContentPayload)
  }

  async function loadTaxonomy(query = taxonomyQuery) {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('admin_taxonomy', {
      search_text: query,
      limit_count: 100,
    })
    if (rpcError) throw rpcError
    setTaxonomy((data || {}) as TaxonomyPayload)
  }

  async function loadAudit() {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('admin_audit_log', { limit_count: 200 })
    if (rpcError) throw rpcError
    setAudit((data || []) as AuditItem[])
  }

  async function loadAnalytics() {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('admin_platform_analytics', { days_back: 30 })
    if (rpcError) throw rpcError
    setAnalytics((data || []) as AnalyticsDay[])
  }

  async function loadHealth() {
    if (!supabase) return
    const [healthResponse, flagsResponse] = await Promise.all([
      supabase.rpc('admin_health_summary'),
      supabase.rpc('admin_feature_flags'),
    ])
    if (healthResponse.error) throw healthResponse.error
    if (flagsResponse.error) throw flagsResponse.error
    setHealth((healthResponse.data || {}) as HealthPayload)
    setFeatureFlags((flagsResponse.data || []) as FeatureFlag[])
  }

  async function loadSettings() {
    if (!supabase) return
    const { data, error: rpcError } = await supabase.rpc('admin_get_settings')
    if (rpcError) throw rpcError
    const next = (data || {}) as Partial<AdminSettings>
    setSettings({
      announcement_enabled: Boolean(next.announcement_enabled),
      announcement_text: String(next.announcement_text || ''),
      allow_new_ad_requests: next.allow_new_ad_requests !== false,
      updated_at: next.updated_at,
    })
  }

  async function loadSection() {
    setLoading(true)
    setError('')
    try {
      const admin = await requireAdmin()
      if (!admin) {
        setLoading(false)
        return
      }
      if (currentSection === 'overview' || currentSection === 'moderation' || currentSection === 'ads' || currentSection === 'faq' || currentSection === 'support') await loadDashboard()
      if (currentSection === 'users') await loadUsers()
      if (currentSection === 'content') await loadContent()
      if (currentSection === 'taxonomy') await loadTaxonomy()
      if (currentSection === 'audit') await loadAudit()
      if (currentSection === 'analytics') await loadAnalytics()
      if (currentSection === 'health') await loadHealth()
      if (currentSection === 'settings') await loadSettings()
    } catch (loadError) {
      console.error(loadError)
      setError('Não foi possível carregar esta área administrativa. Confirme se a migration v4.6 foi aplicada.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSection() }, [supabase, currentSection])

  async function updateRole(target: AdminUser, nextRole: AdminUser['role']) {
    if (!supabase || nextRole === target.role) return
    if (!(await ask({
      title: `Alterar cargo de @${target.username}?`,
      description: `${target.role} → ${nextRole}. Esta ação ficará registrada no Audit Log.`,
      confirmLabel: 'Alterar cargo',
      tone: nextRole === 'ADMIN' ? 'danger' : 'default',
    }))) return
    setBusy(target.id)
    const { error: rpcError } = await supabase.rpc('admin_set_user_role', { target_user: target.id, next_role: nextRole })
    setBusy('')
    if (rpcError) return flash(rpcError.message.includes('OWNER_ADMIN_PROTECTED') ? 'A conta proprietária não pode perder o cargo ADMIN.' : 'Não foi possível alterar o cargo.')
    flash('Cargo atualizado.')
    await loadUsers()
  }

  async function updateStatus(target: AdminUser, nextStatus: AdminUser['status']) {
    if (!supabase || nextStatus === target.status) return
    if (!(await ask({
      title: `${nextStatus === 'ACTIVE' ? 'Reativar' : nextStatus === 'SUSPENDED' ? 'Suspender' : 'Desativar'} @${target.username}?`,
      description: 'A alteração afeta o acesso e ficará registrada no Audit Log.',
      confirmLabel: nextStatus === 'ACTIVE' ? 'Reativar conta' : 'Confirmar',
      tone: nextStatus === 'ACTIVE' ? 'default' : 'danger',
    }))) return
    setBusy(target.id)
    const { error: rpcError } = await supabase.rpc('admin_set_user_status', { target_user: target.id, next_status: nextStatus, reason: 'Alteração pelo Admin Center' })
    setBusy('')
    if (rpcError) return flash(rpcError.message.includes('OWNER_ADMIN_PROTECTED') ? 'A conta proprietária não pode ser suspensa.' : 'Não foi possível alterar o status.')
    flash('Status atualizado.')
    await loadUsers()
  }

  async function toggleWork(item: AdminWork) {
    if (!supabase) return
    const hide = !item.deleted_at
    if (!(await ask({
      title: hide ? 'Ocultar esta obra?' : 'Restaurar esta obra?',
      description: item.title,
      confirmLabel: hide ? 'Ocultar obra' : 'Restaurar obra',
      tone: hide ? 'danger' : 'default',
    }))) return
    setBusy(item.id)
    const { error: rpcError } = await supabase.rpc('admin_set_work_hidden', { target_work: item.id, hide })
    setBusy('')
    if (rpcError) return flash('Não foi possível atualizar a obra.')
    flash(hide ? 'Obra ocultada.' : 'Obra restaurada.')
    await loadContent()
  }

  async function togglePost(item: AdminPost) {
    if (!supabase) return
    const hide = !item.deleted_at
    if (!(await ask({
      title: hide ? 'Ocultar este post?' : 'Restaurar este post?',
      description: item.body || 'Post sem texto',
      confirmLabel: hide ? 'Ocultar post' : 'Restaurar post',
      tone: hide ? 'danger' : 'default',
    }))) return
    setBusy(item.id)
    const { error: rpcError } = await supabase.rpc('admin_set_post_hidden', { target_post: item.id, hide })
    setBusy('')
    if (rpcError) return flash('Não foi possível atualizar o post.')
    flash(hide ? 'Post ocultado.' : 'Post restaurado.')
    await loadContent()
  }

  async function toggleComment(item: AdminComment) {
    if (!supabase) return
    const hide = item.status === 'VISIBLE'
    setBusy(item.id)
    const rpcName = item.kind === 'POST' ? 'admin_set_post_comment_hidden' : 'admin_set_comment_hidden'
    const { error: rpcError } = await supabase.rpc(rpcName, { target_comment: item.id, hide })
    setBusy('')
    if (rpcError) return flash('Não foi possível atualizar o comentário.')
    flash(hide ? 'Comentário ocultado.' : 'Comentário restaurado.')
    await loadContent()
  }

  async function saveTaxonomyRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !editingTaxonomy) return
    const form = new FormData(event.currentTarget)
    const nextName = String(form.get('name') || '').trim()
    if (!nextName) return
    setBusy(editingTaxonomy.id)
    const fn = editingTaxonomy.kind === 'fandom' ? 'admin_rename_fandom' : 'admin_rename_tag'
    const args = editingTaxonomy.kind === 'fandom'
      ? { target_fandom: editingTaxonomy.id, next_name: nextName }
      : { target_tag: editingTaxonomy.id, next_name: nextName }
    const { error: rpcError } = await supabase.rpc(fn, args)
    setBusy('')
    if (rpcError) return flash('Não foi possível renomear.')
    setEditingTaxonomy(null)
    flash('Taxonomia atualizada.')
    await loadTaxonomy()
  }

  async function mergeTags() {
    if (!supabase || !mergeSource || !mergeTarget || mergeSource === mergeTarget) return
    const source = taxonomy.tags?.find((item) => item.id === mergeSource)
    const target = taxonomy.tags?.find((item) => item.id === mergeTarget)
    if (!(await ask({
      title: 'Fundir tags?',
      description: `${source?.name || 'Origem'} será convertido em alias de ${target?.name || 'Destino'} e as obras serão movidas para a tag canônica.`,
      confirmLabel: 'Fundir tags',
      tone: 'danger',
    }))) return
    setBusy('merge-tags')
    const { error: rpcError } = await supabase.rpc('admin_merge_tags', { source_tag: mergeSource, target_tag: mergeTarget })
    setBusy('')
    if (rpcError) return flash('Não foi possível fundir as tags.')
    setMergeSource('')
    setMergeTarget('')
    flash('Tags fundidas.')
    await loadTaxonomy()
  }

  async function toggleFeatureFlag(flag: FeatureFlag) {
    if (!supabase) return
    setBusy('flag-' + flag.key)
    const { error: rpcError } = await supabase.rpc('admin_set_feature_flag', {
      flag_key: flag.key,
      next_enabled: !flag.enabled,
    })
    setBusy('')
    if (rpcError) return flash('Não foi possível atualizar a feature flag.')
    setFeatureFlags((current) => current.map((item) => item.key === flag.key ? { ...item, enabled: !item.enabled, updated_at: new Date().toISOString() } : item))
    flash((!flag.enabled ? 'Ativado: ' : 'Desativado: ') + flag.key)
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy('settings')
    const { error: rpcError } = await supabase.rpc('admin_update_settings', {
      next_announcement_enabled: settings.announcement_enabled,
      next_announcement_text: settings.announcement_text || '',
      next_allow_new_ad_requests: settings.allow_new_ad_requests,
    })
    setBusy('')
    if (rpcError) return flash('Não foi possível salvar as configurações.')
    flash('Configurações da plataforma atualizadas.')
    await loadSettings()
  }

  if (loading) return (
    <>
      <NovaHeader title="Admin Center" />
      <main className="admin-shell"><div className="admin-loading">Carregando Admin Center…</div></main>
    </>
  )

  if (!user) return (
    <>
      <NovaHeader title="Admin Center" />
      <main className="admin-shell"><section className="admin-gate"><span>✦</span><h1>Área administrativa</h1><p>Entre com uma conta administradora.</p><Link className="primary-button" href="/explore?auth=login&return=/admin">Entrar</Link></section></main>
    </>
  )

  if (role !== 'ADMIN') return (
    <>
      <NovaHeader title="Admin Center" />
      <main className="admin-shell"><section className="admin-gate"><span>!</span><h1>Acesso negado</h1><p>Esta área é exclusiva para administradores do Archive Nova. Moderadores devem usar a central de moderação.</p><Link className="secondary-button" href="/moderation">Abrir Moderação</Link></section></main>
    </>
  )

  return (
    <>
      <NovaHeader title="Admin Center" />
      <main className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand"><span>✦</span><div><strong>Archive Nova</strong><small>Admin Center</small></div></div>
          <nav>{NAV.map((item, index) => <div key={item.key}>{item.group && (index === 0 || NAV[index - 1]?.group !== item.group) ? <p>{item.group}</p> : null}<Link className={currentSection === item.key ? 'active' : ''} href={item.key === 'overview' ? '/admin' : `/admin/${item.key}`}>{item.label}</Link></div>)}</nav>
          <footer><Link href="/moderation">Central de Moderação</Link><Link href="/">Voltar ao site</Link></footer>
        </aside>

        <div className="admin-content">
          <header className="admin-topbar"><div><p className="eyebrow">Administração</p><h1>{sectionTitle(currentSection)}</h1></div><span className="admin-identity">✦ Administrador</span></header>

          {error ? <div className="admin-alert error">{error}</div> : null}
          {message ? <div className="admin-alert success">{message}</div> : null}

          {currentSection === 'overview' ? <Overview dashboard={dashboard} /> : null}

          {currentSection === 'users' ? <section className="admin-section">
            <div className="admin-section-head"><div><h2>Usuários e equipe</h2><p>Pesquise contas, altere cargos e suspenda acessos.</p></div><form onSubmit={(event) => { event.preventDefault(); void loadUsers(userQuery) }}><input value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Buscar @username ou e-mail" /><button className="secondary-button">Buscar</button></form></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Atividade</th><th>Cargo</th><th>Status</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><div className="admin-user-cell"><strong>{item.display_name || item.username}</strong><Link href={`/users/${encodeURIComponent(item.username)}`}>@{item.username}</Link><small>{item.email || 'sem e-mail disponível'} · criado {dateTime(item.created_at)}</small></div></td><td><span>{item.works_count} obras</span><span>{item.posts_count} posts</span><span>{item.reports_count} denúncias</span></td><td><select disabled={busy === item.id} value={item.role} onChange={(event) => void updateRole(item, event.target.value as AdminUser['role'])}><option value="USER">Usuário</option><option value="MODERATOR">Moderador</option><option value="ADMIN">Administrador</option></select></td><td><select disabled={busy === item.id} value={item.status} onChange={(event) => void updateStatus(item, event.target.value as AdminUser['status'])}><option value="ACTIVE">Ativa</option><option value="SUSPENDED">Suspensa</option><option value="DELETED">Desativada</option></select></td></tr>)}</tbody></table></div>
          </section> : null}

          {currentSection === 'moderation' ? <PortalSection title="Trust & Safety" description="Denúncias continuam separadas do Admin Center para que moderadores trabalhem sem receber privilégios administrativos." href="/moderation" action="Abrir Central de Moderação" stats={[['Denúncias abertas', fmt(dashboard.trust?.open_reports)], ['Contas suspensas', fmt(dashboard.users?.suspended)], ['Moderadores', fmt(dashboard.users?.moderators)]]} /> : null}

          {currentSection === 'content' ? <section className="admin-section">
            <div className="admin-section-head"><div><h2>Conteúdo da plataforma</h2><p>Ocultar e restaurar obras, posts e comentários sem apagar dados definitivamente.</p></div></div>
            <h3 className="admin-subtitle">Obras recentes</h3>
            <div className="admin-list">{(content.works || []).map((item) => <article key={item.id}><div><strong>{item.title}</strong><span>@{item.author_username} · {item.status} · {item.visibility}</span><small>Atualizada {dateTime(item.updated_at)}</small></div><div><Link className="ghost-button" href={`/works/${item.id}`}>Abrir</Link><button className={item.deleted_at ? 'secondary-button' : 'danger-button'} disabled={busy === item.id} onClick={() => void toggleWork(item)}>{item.deleted_at ? 'Restaurar' : 'Ocultar'}</button></div></article>)}</div>
            <h3 className="admin-subtitle">Posts recentes</h3>
            <div className="admin-list">{(content.posts || []).map((item) => <article key={item.id}><div><strong>@{item.author_username}</strong><span>{item.body || 'Post sem texto'}</span><small>{dateTime(item.created_at)}</small></div><button className={item.deleted_at ? 'secondary-button' : 'danger-button'} disabled={busy === item.id} onClick={() => void togglePost(item)}>{item.deleted_at ? 'Restaurar' : 'Ocultar'}</button></article>)}</div>
            <h3 className="admin-subtitle">Comentários recentes</h3>
            <div className="admin-list">{(content.comments || []).map((item) => <article key={item.id}><div><strong>@{item.author_username}</strong><span>{item.body}</span><small>{item.kind === 'POST' ? 'Comentário em post' : 'Comentário em obra'} · {item.status} · {dateTime(item.created_at)}</small></div><button className={item.status === 'VISIBLE' ? 'danger-button' : 'secondary-button'} disabled={busy === item.id} onClick={() => void toggleComment(item)}>{item.status === 'VISIBLE' ? 'Ocultar' : 'Restaurar'}</button></article>)}</div>
          </section> : null}

          {currentSection === 'taxonomy' ? <section className="admin-section">
            <div className="admin-section-head"><div><h2>Fandoms e tags</h2><p>Organize nomes, slugs, tags canônicas e aliases.</p></div><form onSubmit={(event) => { event.preventDefault(); void loadTaxonomy(taxonomyQuery) }}><input value={taxonomyQuery} onChange={(event) => setTaxonomyQuery(event.target.value)} placeholder="Buscar fandom ou tag" /><button className="secondary-button">Buscar</button></form></div>
            <div className="admin-taxonomy-grid"><div><h3>Fandoms</h3>{(taxonomy.fandoms || []).map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>/{item.slug} · {item.work_count} obras</small></div><button className="ghost-button" onClick={() => setEditingTaxonomy({ kind: 'fandom', id: item.id, name: item.name })}>Renomear</button></article>)}</div><div><h3>Tags</h3>{(taxonomy.tags || []).map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{item.type} · {item.work_count} obras {item.canonical ? '· canônica' : ''}</small></div><button className="ghost-button" onClick={() => setEditingTaxonomy({ kind: 'tag', id: item.id, name: item.name })}>Renomear</button></article>)}</div></div>
            {editingTaxonomy ? <form className="admin-inline-form" onSubmit={saveTaxonomyRename}><strong>Renomear {editingTaxonomy.kind === 'tag' ? 'tag' : 'fandom'}</strong><input name="name" defaultValue={editingTaxonomy.name} required /><button className="primary-button" disabled={busy === editingTaxonomy.id}>Salvar</button><button className="ghost-button" type="button" onClick={() => setEditingTaxonomy(null)}>Cancelar</button></form> : null}
            <div className="admin-merge-box"><div><h3>Fundir tags</h3><p>A tag de origem vira alias da tag de destino e as associações das obras são migradas.</p></div><select value={mergeSource} onChange={(event) => setMergeSource(event.target.value)}><option value="">Tag de origem</option>{(taxonomy.tags || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Tag canônica</option>{(taxonomy.tags || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="danger-button" disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget || busy === 'merge-tags'} onClick={() => void mergeTags()}>Fundir</button></div>
          </section> : null}

          {currentSection === 'ads' ? <PortalSection title="Publicidade" description="Campanhas e solicitações agora são controladas exclusivamente por administradores." href="/advertise" action="Gerenciar publicidade" stats={[['Solicitações abertas', fmt(dashboard.trust?.open_ad_requests)], ['Campanhas ativas', fmt(dashboard.trust?.active_campaigns)]]} /> : null}
          {currentSection === 'faq' ? <PortalSection title="FAQ" description="Editar, publicar e ocultar perguntas da Central de Ajuda é uma função administrativa." href="/faq" action="Gerenciar FAQ" /> : null}
          {currentSection === 'support' ? <PortalSection title="Apoio ao Archive Nova" description="As configurações de apoio institucional ficam restritas ao administrador. Autores continuam podendo configurar o próprio apoio." href="/settings/support" action="Configurar apoio" /> : null}

          {currentSection === 'audit' ? <section className="admin-section">
            <div className="admin-section-head"><div><h2>Audit Log</h2><p>Histórico de ações administrativas e de moderação sensíveis.</p></div><button className="secondary-button" onClick={() => void loadAudit()}>Atualizar</button></div>
            <div className="admin-audit-list">{audit.map((item) => <article key={item.id}><span>{dateTime(item.created_at)}</span><div><strong>{item.action}</strong><small>{item.actor_username ? `@${item.actor_username}` : 'Sistema'} · {item.entity_type}{item.entity_id ? ` · ${item.entity_id}` : ''}</small>{Object.keys(item.metadata || {}).length ? <code>{JSON.stringify(item.metadata)}</code> : null}</div></article>)}</div>
          </section> : null}

          {currentSection === 'analytics' ? <section className="admin-section">
            <div className="admin-section-head"><div><h2>Últimos 30 dias</h2><p>Novos usuários, obras, posts, denúncias e leituras registradas por dia.</p></div></div>
            <div className="admin-analytics-summary"><Metric label="Novos usuários" value={analytics.reduce((sum, item) => sum + Number(item.users || 0), 0)} /><Metric label="Novas obras" value={analytics.reduce((sum, item) => sum + Number(item.works || 0), 0)} /><Metric label="Posts" value={analytics.reduce((sum, item) => sum + Number(item.posts || 0), 0)} /><Metric label="Leituras" value={analytics.reduce((sum, item) => sum + Number(item.hits || 0), 0)} /></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Usuários</th><th>Obras</th><th>Posts</th><th>Denúncias</th><th>Leituras</th></tr></thead><tbody>{analytics.slice().reverse().map((item) => <tr key={item.date}><td>{item.date}</td><td>{fmt(item.users)}</td><td>{fmt(item.works)}</td><td>{fmt(item.posts)}</td><td>{fmt(item.reports)}</td><td>{fmt(item.hits)}</td></tr>)}</tbody></table></div>
          </section> : null}

          {currentSection === 'health' ? <section className="admin-section admin-health-v47">
            <div className="admin-section-head"><div><h2>Saúde da plataforma</h2><p>Visão rápida do banco, segurança operacional e recursos liberados no Archive Nova.</p></div><button className="secondary-button" onClick={() => void loadHealth()}>Atualizar</button></div>
            <div className="admin-analytics-summary">
              <Metric label="Tabelas públicas" value={health.database?.public_tables} />
              <Metric label="Funções públicas" value={health.database?.public_functions} />
              <Metric label="Obras públicas" value={health.content?.public_works} />
              <Metric label="Denúncias abertas" value={health.content?.open_reports} />
              <Metric label="Capítulos agendados" value={health.content?.scheduled_chapters} />
              <Metric label="Rate events / 1h" value={health.security?.rate_events_1h} />
            </div>
            <div className="admin-health-details-v47">
              <article><span>Última migration</span><strong>{health.database?.latest_migration || '—'}</strong></article>
              <article><span>Tamanho do banco</span><strong>{health.database?.size_bytes ? (Number(health.database.size_bytes) / 1024 / 1024).toFixed(1) + ' MB' : '—'}</strong></article>
              <article className={Number(health.security?.rls_tables_without_policies || 0) ? 'warn' : 'ok'}><span>RLS sem policy</span><strong>{fmt(health.security?.rls_tables_without_policies)}</strong></article>
              <article><span>Contas suspensas</span><strong>{fmt(health.security?.suspended_users)}</strong></article>
            </div>

            <div className="admin-section-head feature-flags-head-v47"><div><h2>Feature flags</h2><p>Desligue módulos novos sem precisar reverter deploys ou apagar dados.</p></div></div>
            <div className="admin-feature-flags-v47">
              {featureFlags.map((flag) => <article key={flag.key}><div><code>{flag.key}</code><strong>{flag.enabled ? 'Ativo' : 'Desativado'}</strong><p>{flag.description || 'Sem descrição.'}</p><small>Atualizado {dateTime(flag.updated_at)}</small></div><button className={flag.enabled ? 'secondary-button' : 'primary-button'} disabled={busy === 'flag-' + flag.key} onClick={() => void toggleFeatureFlag(flag)}>{busy === 'flag-' + flag.key ? 'Salvando…' : flag.enabled ? 'Desativar' : 'Ativar'}</button></article>)}
            </div>
          </section> : null}

          {currentSection === 'settings' ? <section className="admin-section">
            <div className="admin-section-head"><div><h2>Configurações globais</h2><p>Controles que alteram comportamento público do Archive Nova.</p></div></div>
            <form className="admin-settings-form" onSubmit={saveSettings}>
              <label className="admin-toggle"><input type="checkbox" checked={settings.announcement_enabled} onChange={(event) => setSettings((current) => ({ ...current, announcement_enabled: event.target.checked }))} /><span><strong>Exibir aviso global</strong><small>Mostra uma faixa informativa no topo do site para todos os visitantes.</small></span></label>
              <label>Texto do aviso<textarea value={settings.announcement_text || ''} maxLength={500} rows={4} onChange={(event) => setSettings((current) => ({ ...current, announcement_text: event.target.value }))} placeholder="Ex.: manutenção programada, atualização importante…" /></label>
              <label className="admin-toggle"><input type="checkbox" checked={settings.allow_new_ad_requests} onChange={(event) => setSettings((current) => ({ ...current, allow_new_ad_requests: event.target.checked }))} /><span><strong>Aceitar novas solicitações de publicidade</strong><small>Quando desligado, novos pedidos de anúncio são bloqueados no banco.</small></span></label>
              {settings.updated_at ? <small>Última alteração: {dateTime(settings.updated_at)}</small> : null}
              <footer><button className="primary-button" disabled={busy === 'settings'}>{busy === 'settings' ? 'Salvando…' : 'Salvar configurações'}</button></footer>
            </form>
          </section> : null}
        </div>
        {dialog}
      </main>
    </>
  )
}

function Metric({ label, value }: { label: string; value: number | undefined }) {
  return <div className="admin-metric"><strong>{fmt(value)}</strong><span>{label}</span></div>
}

function Overview({ dashboard }: { dashboard: DashboardPayload }) {
  return <div className="admin-overview">
    <section className="admin-hero-card"><div><p className="eyebrow">Painel principal</p><h2>Controle operacional do Archive Nova</h2><p>Usuários, conteúdo, moderação, monetização e segurança em um único lugar.</p></div><span className="admin-owner-badge">✦ ADMIN</span></section>
    <section className="admin-metrics-grid">
      <Metric label="Usuários" value={dashboard.users?.total} />
      <Metric label="Obras públicas" value={dashboard.content?.public_works} />
      <Metric label="Posts" value={dashboard.content?.posts} />
      <Metric label="Denúncias abertas" value={dashboard.trust?.open_reports} />
      <Metric label="Suspensos" value={dashboard.users?.suspended} />
      <Metric label="Moderadores" value={dashboard.users?.moderators} />
      <Metric label="Admins" value={dashboard.users?.admins} />
      <Metric label="Leituras em 24h" value={dashboard.activity?.hits_24h} />
    </section>
    <section className="admin-quick-grid">
      <Link href="/admin/users"><strong>Usuários</strong><span>Gerenciar cargos, suspensões e equipe.</span></Link>
      <Link href="/moderation"><strong>Trust & Safety</strong><span>{fmt(dashboard.trust?.open_reports)} denúncias aguardando tratamento.</span></Link>
      <Link href="/admin/content"><strong>Conteúdo</strong><span>Ocultar ou restaurar obras, posts e comentários.</span></Link>
      <Link href="/admin/taxonomy"><strong>Taxonomia</strong><span>Fandoms, tags, aliases e organização.</span></Link>
      <Link href="/admin/audit"><strong>Audit Log</strong><span>Rastrear ações administrativas sensíveis.</span></Link>
      <Link href="/admin/health"><strong>Saúde & flags</strong><span>Banco, segurança e rollout de módulos novos.</span></Link>
      <Link href="/admin/settings"><strong>Configurações</strong><span>Aviso global e controles operacionais.</span></Link>
    </section>
  </div>
}

function PortalSection({ title, description, href, action, stats = [] }: { title: string; description: string; href: string; action: string; stats?: Array<[string, string]> }) {
  return <section className="admin-section admin-portal">
    <div><p className="eyebrow">Módulo integrado</p><h2>{title}</h2><p>{description}</p><Link className="primary-button" href={href}>{action}</Link></div>
    {stats.length ? <div className="admin-portal-stats">{stats.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div> : null}
  </section>
}
