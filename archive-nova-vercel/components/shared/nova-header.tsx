'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

type MiniProfile = { username: string; display_name: string | null; role?: string }

export function NovaHeader({ title }: { title?: string }) {
  const pathname = usePathname()
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<MiniProfile | null>(null)
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    async function hydrate(nextUser?: User | null) {
      const resolved = nextUser === undefined ? (await client.auth.getUser()).data.user : nextUser
      if (!active) return
      setUser(resolved || null)
      if (!resolved) {
        setProfile(null)
        setUnread(0)
        return
      }
      const [profileResponse, notificationResponse] = await Promise.all([
        client.from('profiles').select('username,display_name,role').eq('id', resolved.id).maybeSingle(),
        client.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
      ])
      if (!active) return
      if (profileResponse.data) setProfile(profileResponse.data as MiniProfile)
      setUnread(notificationResponse.count || 0)
    }

    void hydrate()
    const { data } = client.auth.onAuthStateChange((_event, session) => void hydrate(session?.user || null))
    return () => { active = false; data.subscription.unsubscribe() }
  }, [supabase])

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const returnPath = pathname || '/'
  const profileHref = profile ? `/users/${encodeURIComponent(profile.username)}` : '/explore'

  return (
    <>
      <header className="nova-header">
        <Link className="nova-header-brand" href="/"><span>✦</span><strong>Archive Nova</strong></Link>
        {title ? <div className="nova-header-context">{title}</div> : null}
        <nav className={`nova-header-nav ${menuOpen ? 'open' : ''}`} aria-label="Navegação">
          <Link href="/explore" onClick={() => setMenuOpen(false)}>Explorar</Link>
          {user ? <Link href="/dashboard" onClick={() => setMenuOpen(false)}>Studio</Link> : null}
          {user ? <Link className="nova-notification-link" href="/notifications" onClick={() => setMenuOpen(false)}>Notificações{unread > 0 ? <b>{unread > 99 ? '99+' : unread}</b> : null}</Link> : null}
          {profile?.role === 'MODERATOR' || profile?.role === 'ADMIN' ? <Link href="/moderation" onClick={() => setMenuOpen(false)}>Moderação</Link> : null}
          {user ? <Link href={profileHref} onClick={() => setMenuOpen(false)}>Perfil</Link> : null}
        </nav>
        <div className="nova-header-actions">
          {user ? (
            <>
              <Link className="nova-write-button" href="/write">＋ Escrever</Link>
              <button className="nova-account-button" type="button" onClick={signOut} title="Sair da conta">{(profile?.display_name || profile?.username || user.email || 'U').slice(0, 1).toUpperCase()}</button>
            </>
          ) : <Link className="nova-write-button" href={`/explore?auth=login&return=${encodeURIComponent(returnPath)}`}>Entrar</Link>}
          <button className="nova-menu-button" type="button" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>☰</button>
        </div>
      </header>
      <nav className="nova-mobile-dock" aria-label="Navegação móvel">
        <Link className={pathname === '/explore' ? 'active' : ''} href="/explore"><span>⌕</span><small>Explorar</small></Link>
        <Link className={pathname?.startsWith('/dashboard') ? 'active' : ''} href={user ? '/dashboard' : `/explore?auth=login&return=${encodeURIComponent('/dashboard')}`}><span>◫</span><small>Studio</small></Link>
        <Link className="write" href="/write"><span>＋</span><small>Escrever</small></Link>
        <Link className={pathname?.startsWith('/notifications') ? 'active' : ''} href={user ? '/notifications' : `/explore?auth=login&return=${encodeURIComponent('/notifications')}`}><span>♢{unread > 0 ? <i /> : null}</span><small>Alertas</small></Link>
        <Link className={pathname?.startsWith('/users') ? 'active' : ''} href={user ? profileHref : `/explore?auth=login&return=${encodeURIComponent(returnPath)}`}><span>◎</span><small>Perfil</small></Link>
      </nav>
    </>
  )
}
