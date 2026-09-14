'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'

export function ProfileSettings() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    void (async () => {
      const current = (await supabase.auth.getUser()).data.user || null
      setUser(current)
      if (!current) { setLoading(false); return }
      const { data, error: profileError } = await supabase.from('profiles').select('username,display_name,bio').eq('id', current.id).maybeSingle()
      if (profileError || !data) { setError('Não foi possível carregar seu perfil.'); setLoading(false); return }
      setUsername(String(data.username || ''))
      setDisplayName(String(data.display_name || ''))
      setBio(String(data.bio || ''))
      setLoading(false)
    })()
  }, [supabase])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) return
    const cleanDisplay = displayName.trim()
    const cleanBio = bio.trim()
    if (cleanDisplay.length > 80) return setError('O nome de exibição deve ter no máximo 80 caracteres.')
    if (cleanBio.length > 3000) return setError('A bio está muito longa.')
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.from('profiles').update({ display_name: cleanDisplay || null, bio: cleanBio || null }).eq('id', user.id)
    setBusy(false)
    if (updateError) return setError(updateError.message || 'Não foi possível salvar o perfil.')
    setMessage('Perfil atualizado.')
    window.setTimeout(() => setMessage(''), 2500)
  }

  if (loading) return <><NovaHeader title="Perfil" /><main className="settings-page"><div className="studio-loading"><span /><h1>Carregando perfil…</h1></div></main></>
  if (!user) return <><NovaHeader title="Perfil" /><main className="settings-page"><div className="studio-gate"><span>◎</span><h1>Entre para editar seu perfil.</h1><Link className="primary-button" href="/explore?auth=login&return=/settings/profile">Entrar</Link></div></main></>

  return (
    <>
      <NovaHeader title="Perfil" />
      <main className="settings-page">
        <section className="settings-head"><div><p className="eyebrow">Conta</p><h1>Seu perfil público</h1><p>Escolha como leitores veem você no Archive Nova.</p></div><Link className="secondary-button" href={`/users/${encodeURIComponent(username)}`}>Ver perfil público ↗</Link></section>
        <form className="settings-card" onSubmit={submit}>
          <div className="settings-avatar-preview">{(displayName || username || 'U').slice(0,1).toUpperCase()}<i>✦</i></div>
          <div className="settings-form-fields">
            <label>Nome de exibição<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} placeholder={username} /><small>Seu @username continua sendo @{username}.</small></label>
            <label>Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={8} maxLength={3000} placeholder="Conte sobre você, seus fandoms e o que gosta de escrever…" /><small>{bio.length}/3000</small></label>
            {error ? <div className="studio-alert error">{error}</div> : null}
            {message ? <div className="studio-alert success">{message}</div> : null}
            <div className="settings-actions"><Link className="ghost-button" href="/dashboard">Cancelar</Link><button className="primary-button large" disabled={busy}>{busy ? 'Salvando…' : 'Salvar perfil'}</button></div>
          </div>
        </form>
      </main>
    </>
  )
}
