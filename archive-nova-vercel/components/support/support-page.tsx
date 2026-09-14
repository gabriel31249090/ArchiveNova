'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'
import { buildPixPayload } from '@/lib/pix'
import type { SupportProfile } from '@/lib/types'

type Target = { name: string; username?: string; avatar: string; support: SupportProfile }

const EMPTY_SUPPORT: SupportProfile = { enabled: false, message: null, pix_key: null, pix_receiver_name: null, pix_city: null, paypal_url: null, ko_fi_url: null, mercado_pago_url: null, other_label: null, other_url: null }

export function SupportPage({ username }: { username?: string }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [target, setTarget] = useState<Target | null>(null)
  const [amount, setAmount] = useState('')
  const [pixPayload, setPixPayload] = useState('')
  const [qr, setQr] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let active = true
    void (async () => {
      if (username) {
        const { data: profile } = await supabase.from('profiles').select('id,username,display_name').eq('username', decodeURIComponent(username)).maybeSingle()
        if (!active || !profile) { setLoading(false); return }
        const { data: support } = await supabase.from('creator_support_profiles').select('*').eq('user_id', profile.id).eq('enabled', true).maybeSingle()
        if (!active) return
        setTarget({ name: profile.display_name || profile.username, username: profile.username, avatar: (profile.display_name || profile.username).slice(0, 1).toUpperCase(), support: support ? support as SupportProfile : EMPTY_SUPPORT })
      } else {
        const { data: support } = await supabase.from('project_support_config').select('*').eq('id', 1).maybeSingle()
        if (!active) return
        setTarget({ name: 'Archive Nova', avatar: '✦', support: support ? support as SupportProfile : EMPTY_SUPPORT })
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [supabase, username])

  useEffect(() => {
    if (!target?.support.pix_key) { setPixPayload(''); setQr(''); return }
    const parsed = Number(String(amount).replace(',', '.'))
    const payload = buildPixPayload({ key: target.support.pix_key, receiverName: target.support.pix_receiver_name || target.name, city: target.support.pix_city || 'BRASIL', amount: Number.isFinite(parsed) && parsed > 0 ? parsed : null, description: username ? `APOIO ${target.name}` : 'APOIO ARCHIVENOVA' })
    setPixPayload(payload)
    let active = true
    void QRCode.toDataURL(payload, { width: 340, margin: 1, errorCorrectionLevel: 'M' }).then((url) => { if (active) setQr(url) })
    return () => { active = false }
  }, [amount, target, username])

  async function copy(value: string, label: string) {
    await navigator.clipboard?.writeText(value)
    setMessage(`${label} copiado.`)
    window.setTimeout(() => setMessage(''), 2200)
  }

  if (loading) return <><NovaHeader title="Apoio" /><main className="support-page"><div className="community-loading"><span /><p>Carregando formas de apoio…</p></div></main></>
  if (!target) return <><NovaHeader title="Apoio" /><main className="support-page"><div className="profile-not-found"><span>✦</span><h1>Perfil não encontrado.</h1><Link className="primary-button" href="/explore">Voltar</Link></div></main></>

  const support = target.support
  const external = [
    support.paypal_url ? ['PayPal', support.paypal_url] : null,
    support.ko_fi_url ? ['Ko-fi', support.ko_fi_url] : null,
    support.mercado_pago_url ? ['Mercado Pago', support.mercado_pago_url] : null,
    support.other_url ? [support.other_label || 'Outro método', support.other_url] : null,
  ].filter(Boolean) as string[][]

  return (
    <>
      <NovaHeader title="Apoio" />
      <main className="support-page">
        <section className="support-hero"><div className="support-avatar">{target.avatar}</div><div><p className="eyebrow">Apoio direto</p><h1>{username ? `Apoie ${target.name}` : 'Ajude o Archive Nova a continuar existindo.'}</h1><p>{support.message || (username ? 'Este escritor ainda não adicionou uma mensagem de apoio.' : 'Contribuições ajudam com infraestrutura, domínio e manutenção do projeto.')}</p>{username ? <Link href={`/users/${encodeURIComponent(target.username || '')}`}>← Voltar ao perfil</Link> : null}</div></section>

        {!support.enabled ? <section className="support-disabled"><span><NovaIcon name="heart" size={30} /></span><h2>{username ? 'Este escritor ainda não ativou o apoio.' : 'O apoio ao projeto ainda não foi configurado.'}</h2><p>{username ? 'Quando ele adicionar PIX ou outro método, as opções aparecerão aqui.' : 'A equipe pode ativar as opções quando estiver pronta.'}</p></section> : <div className="support-grid">
          {support.pix_key ? <section className="pix-card"><header><div><p className="eyebrow">PIX</p><h2>Escanear ou copiar</h2></div><span>Pagamento direto</span></header><label>Valor opcional (R$)<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Ex.: 10,00" /></label>{qr ? <div className="pix-qr"><img src={qr} alt="QR Code PIX" /></div> : null}<div className="pix-key-row"><div><small>Chave PIX</small><strong>{support.pix_key}</strong></div><button onClick={() => void copy(support.pix_key || '', 'Chave PIX')}><NovaIcon name="copy" size={15} /> Copiar</button></div><button className="secondary-button pix-copy-payload" onClick={() => void copy(pixPayload, 'PIX Copia e Cola')}>Copiar PIX Copia e Cola</button><p className="support-safety">O Archive Nova apenas exibe os dados informados pelo destinatário. O pagamento acontece fora da plataforma e o Archive Nova não recebe nem intermedeia o valor.</p></section> : null}
          <section className="support-methods"><p className="eyebrow">Outras formas</p><h2>Links externos</h2>{external.length ? <div>{external.map(([label,url]) => <a key={label} href={url} target="_blank" rel="noreferrer noopener"><span>{label}</span><b><NovaIcon name="external" size={15} /></b></a>)}</div> : <p className="muted-copy">Nenhum outro método foi configurado.</p>}<div className="support-note"><span>✦</span><p>Confirme sempre o nome do recebedor no aplicativo do banco antes de concluir um PIX.</p></div></section>
        </div>}
        {message ? <div className="reader-page-toast" role="status">{message}</div> : null}
      </main>
    </>
  )
}
