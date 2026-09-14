'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { SupportProfile } from '@/lib/types'

const EMPTY: SupportProfile = { enabled: false, message: '', pix_key: '', pix_receiver_name: '', pix_city: '', paypal_url: '', ko_fi_url: '', mercado_pago_url: '', other_label: '', other_url: '' }

type SupportKey = keyof SupportProfile

function SupportFields({ values, onChange, project = false }: { values: SupportProfile; onChange: <K extends SupportKey>(key: K, value: SupportProfile[K]) => void; project?: boolean }) {
  return <>
    <label className="support-enable"><input type="checkbox" checked={values.enabled} onChange={(event) => onChange('enabled', event.target.checked)} /><span><strong>{project ? 'Ativar apoio ao Archive Nova' : 'Ativar apoio no meu perfil'}</strong><small>{project ? 'Exibe as opções de contribuição na página /support.' : 'Exibe o botão Apoiar para leitores.'}</small></span></label>
    <label>Mensagem para leitores<textarea rows={4} value={values.message || ''} onChange={(event) => onChange('message', event.target.value)} maxLength={2000} placeholder={project ? 'Ex.: Ajude a manter o Archive Nova independente…' : 'Ex.: Se você gosta das minhas histórias e quiser apoiar…'} /></label>
    <div className="support-settings-section"><header><span>PIX</span><small>O QR Code e o PIX Copia e Cola são gerados automaticamente.</small></header><label>Chave PIX<input value={values.pix_key || ''} onChange={(event) => onChange('pix_key', event.target.value)} maxLength={180} placeholder="E-mail, telefone, CPF/CNPJ ou chave aleatória" /></label><div className="two-columns"><label>Nome do recebedor<input value={values.pix_receiver_name || ''} onChange={(event) => onChange('pix_receiver_name', event.target.value)} maxLength={25} placeholder="NOME DO RECEBEDOR" /></label><label>Cidade<input value={values.pix_city || ''} onChange={(event) => onChange('pix_city', event.target.value)} maxLength={15} placeholder="CUIABA" /></label></div><p className="settings-hint">Nome e cidade são usados no padrão BR Code do PIX. O Archive Nova não processa o pagamento.</p></div>
    <div className="support-settings-section"><header><span>Outros métodos</span><small>Use apenas URLs oficiais da conta de recebimento.</small></header><label>PayPal<input type="url" value={values.paypal_url || ''} onChange={(event) => onChange('paypal_url', event.target.value)} placeholder="https://paypal.me/…" /></label><label>Ko-fi<input type="url" value={values.ko_fi_url || ''} onChange={(event) => onChange('ko_fi_url', event.target.value)} placeholder="https://ko-fi.com/…" /></label><label>Mercado Pago<input type="url" value={values.mercado_pago_url || ''} onChange={(event) => onChange('mercado_pago_url', event.target.value)} placeholder="https://link.mercadopago.com.br/…" /></label><div className="two-columns"><label>Nome de outro método<input value={values.other_label || ''} onChange={(event) => onChange('other_label', event.target.value)} maxLength={50} placeholder="Buy Me a Coffee" /></label><label>Link<input type="url" value={values.other_url || ''} onChange={(event) => onChange('other_url', event.target.value)} placeholder="https://…" /></label></div></div>
  </>
}

export function SupportSettings() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [userId, setUserId] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('USER')
  const [values, setValues] = useState<SupportProfile>(EMPTY)
  const [projectValues, setProjectValues] = useState<SupportProfile>(EMPTY)
  const [message, setMessage] = useState('')
  const [projectMessage, setProjectMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const isStaff = role === 'ADMIN' || role === 'MODERATOR'

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    void (async () => {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) { window.location.href = `/explore?auth=login&return=${encodeURIComponent('/settings/support')}`; return }
      setUserId(user.id)
      const profileResponse = await supabase.from('profiles').select('username,role').eq('id', user.id).maybeSingle()
      const nextRole = String(profileResponse.data?.role || 'USER')
      setUsername(String(profileResponse.data?.username || ''))
      setRole(nextRole)

      const supportResponse = await supabase.from('creator_support_profiles').select('*').eq('user_id', user.id).maybeSingle()
      if (supportResponse.data) setValues(supportResponse.data as SupportProfile)

      if (nextRole === 'ADMIN' || nextRole === 'MODERATOR') {
        const projectResponse = await supabase.from('project_support_config').select('*').eq('id', 1).maybeSingle()
        if (projectResponse.data) setProjectValues(projectResponse.data as SupportProfile)
      }
      setLoading(false)
    })()
  }, [supabase])

  function field<K extends SupportKey>(key: K, value: SupportProfile[K]) { setValues((current) => ({ ...current, [key]: value })) }
  function projectField<K extends SupportKey>(key: K, value: SupportProfile[K]) { setProjectValues((current) => ({ ...current, [key]: value })) }

  async function saveCreator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !userId) return
    setMessage('Salvando…')
    const { error } = await supabase.from('creator_support_profiles').upsert({ user_id: userId, ...values })
    if (error) { console.error(error); setMessage('Não foi possível salvar.') }
    else setMessage('Configurações de apoio salvas.')
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !isStaff) return
    setProjectMessage('Salvando…')
    const { error } = await supabase.from('project_support_config').upsert({ id: 1, ...projectValues })
    if (error) { console.error(error); setProjectMessage('Não foi possível salvar o apoio ao projeto.') }
    else setProjectMessage('Apoio ao Archive Nova atualizado.')
  }

  if (loading) return <><NovaHeader title="Apoio" /><main className="settings-page"><div className="community-loading"><span /><p>Carregando…</p></div></main></>

  return <><NovaHeader title="Apoio" /><main className="settings-page"><section className="settings-head"><div><p className="eyebrow">Monetização direta</p><h1>Apoio dos leitores</h1><p>PIX e links externos, sem o Archive Nova intermediar ou reter pagamentos.</p></div><div className="support-settings-head-actions">{username ? <Link className="secondary-button" href={`/support/${encodeURIComponent(username)}`}>Minha página</Link> : null}<Link className="secondary-button" href="/support">Apoiar projeto</Link></div></section>

    <form className="support-settings-card" onSubmit={saveCreator}><div className="support-settings-title"><div><p className="eyebrow">Escritor</p><h2>Meu apoio</h2></div><span>Visível no seu perfil</span></div><SupportFields values={values} onChange={field} /><footer><span>{message}</span><button className="primary-button">Salvar meu apoio</button></footer></form>

    {isStaff ? <form className="support-settings-card project-support-admin" onSubmit={saveProject}><div className="support-settings-title"><div><p className="eyebrow">Administração</p><h2>Apoio ao projeto</h2></div><Link href="/support">Visualizar /support →</Link></div><SupportFields values={projectValues} onChange={projectField} project /><footer><span>{projectMessage}</span><button className="primary-button">Salvar apoio do projeto</button></footer></form> : null}
  </main></>
}
