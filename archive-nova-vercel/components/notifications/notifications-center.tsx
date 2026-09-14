'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { NotificationItem } from '@/lib/types'

function labelFor(item: NotificationItem) {
  const actor = item.actor_display_name || item.actor_username || 'Alguém'
  if (item.type === 'KUDOS') return { icon: '♥', title: `${actor} deixou kudos`, body: item.work_title ? `em “${item.work_title}”` : 'em uma das suas obras.' }
  if (item.type === 'COMMENT') return { icon: '☁', title: `${actor} comentou`, body: item.work_title ? `em “${item.work_title}”` : 'em uma das suas obras.' }
  if (item.type === 'COMMENT_REPLY') return { icon: '↩', title: `${actor} respondeu seu comentário`, body: item.work_title ? `em “${item.work_title}”` : '' }
  if (item.type === 'NEW_FOLLOWER') return { icon: '＋', title: `${actor} começou a seguir você`, body: 'Um novo leitor entrou no seu arquivo.' }
  if (item.type === 'NEW_CHAPTER') return { icon: '✎', title: 'Novo capítulo publicado', body: item.work_title ? `“${item.work_title}” foi atualizada.` : 'Uma obra que você acompanha foi atualizada.' }
  return { icon: '✦', title: 'Nova atividade', body: item.work_title || '' }
}

function relativeDate(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days} d`
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value))
}

export function NotificationsCenter() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(filter = onlyUnread) {
    if (!supabase) { setLoading(false); return }
    const current = (await supabase.auth.getUser()).data.user || null
    setUser(current)
    if (!current) { setLoading(false); return }
    const { data, error: feedError } = await supabase.rpc('notifications_feed', { limit_count: 80, unread_only: filter })
    if (feedError) {
      console.error(feedError)
      setError('Não foi possível carregar as notificações. Execute a migration das Fases 6–8.')
      setLoading(false)
      return
    }
    const payload = (data || {}) as { unread_count?: number; items?: NotificationItem[] }
    setUnread(Number(payload.unread_count || 0))
    setItems(payload.items || [])
    setLoading(false)
  }

  useEffect(() => { void load(onlyUnread) }, [onlyUnread, supabase])

  async function markAll() {
    if (!supabase) return
    await supabase.rpc('mark_all_notifications_read')
    await load(onlyUnread)
  }

  async function openNotification(item: NotificationItem) {
    if (!supabase) return
    if (!item.read_at) {
      await supabase.rpc('mark_notification_read', { target_notification: item.id })
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry))
      setUnread((current) => Math.max(0, current - 1))
    }
    if (item.work_id) window.location.href = `/works/${item.work_id}`
    else if (item.actor_username) window.location.href = `/users/${encodeURIComponent(item.actor_username)}`
  }

  if (loading) return <><NovaHeader title="Notificações" /><main className="notifications-page"><div className="studio-loading"><span /><h1>Carregando atividade…</h1></div></main></>
  if (!user) return <><NovaHeader title="Notificações" /><main className="notifications-page"><div className="studio-gate"><span>♢</span><h1>Entre para ver sua atividade.</h1><p>Kudos, comentários, seguidores e novos capítulos aparecem aqui.</p><Link className="primary-button" href="/explore?auth=login&return=/notifications">Entrar</Link></div></main></>

  return (
    <>
      <NovaHeader title="Notificações" />
      <main className="notifications-page">
        <section className="notifications-head"><div><p className="eyebrow">Sua atividade</p><h1>Notificações</h1><p>Acompanhe leitores, conversas e histórias que você segue.</p></div><div className="notifications-head-actions"><button className={`secondary-button ${onlyUnread ? 'active' : ''}`} onClick={() => setOnlyUnread((value) => !value)}>{onlyUnread ? 'Mostrando não lidas' : 'Somente não lidas'}</button><button className="primary-button" disabled={!unread} onClick={markAll}>Marcar todas como lidas</button></div></section>
        {error ? <div className="studio-alert error">{error}</div> : null}
        <section className="notifications-shell">
          <div className="notifications-summary"><span className="notification-orb">♢{unread > 0 ? <i /> : null}</span><div><strong>{unread}</strong><span>não lida{unread === 1 ? '' : 's'}</span></div></div>
          <div className="notification-list">
            {items.length ? items.map((item) => {
              const copy = labelFor(item)
              return <button className={`notification-row ${item.read_at ? '' : 'unread'}`} key={item.id} onClick={() => void openNotification(item)}><span className="notification-icon">{copy.icon}</span><div className="notification-copy"><div><strong>{copy.title}</strong>{!item.read_at ? <i /> : null}</div><p>{copy.body}</p><small>{relativeDate(item.created_at)}</small></div><span className="notification-arrow">→</span></button>
            }) : <div className="studio-empty large"><span>♢</span><h2>{onlyUnread ? 'Tudo lido' : 'Nenhuma notificação ainda'}</h2><p>{onlyUnread ? 'Você está em dia com sua atividade.' : 'Quando algo acontecer no seu arquivo, aparecerá aqui.'}</p></div>}
          </div>
        </section>
      </main>
    </>
  )
}
