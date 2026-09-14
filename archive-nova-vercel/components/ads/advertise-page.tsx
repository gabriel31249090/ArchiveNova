'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { NovaHeader } from '@/components/shared/nova-header'
import type { AdCampaign } from '@/lib/types'

type RequestRow = { id: string; advertiser_name: string; contact_email: string; title: string; target_url: string; placement: string; message: string | null; status: string; created_at: string }

export function AdvertisePage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState('USER')
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const isAdmin = role === 'ADMIN'

  async function load() {
    if (!supabase) return
    const current = (await supabase.auth.getUser()).data.user || null
    setUser(current)
    if (!current) return
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', current.id).maybeSingle()
    const nextRole = String(profile?.role || 'USER')
    setRole(nextRole)
    if (nextRole === 'ADMIN') {
      const [requestResponse, campaignResponse] = await Promise.all([
        supabase.from('ad_requests').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('ad_campaigns').select('*').order('created_at', { ascending: false }).limit(50),
      ])
      setRequests((requestResponse.data || []) as RequestRow[])
      setCampaigns(((campaignResponse.data || []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id), advertiser_name: String(row.advertiser_name), title: String(row.title), body: String(row.body || ''), image_url: row.image_url ? String(row.image_url) : null,
        target_url: String(row.target_url), placement: String(row.placement) as AdCampaign['placement'], status: String(row.status) as AdCampaign['status'], impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0),
      })))
    }
  }

  useEffect(() => { void load() }, [supabase])

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !user) { window.location.href = `/explore?auth=login&return=${encodeURIComponent('/advertise')}`; return }
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true); setMessage('')
    const { error } = await supabase.from('ad_requests').insert({
      requester_id: user.id,
      advertiser_name: String(values.get('advertiser_name') || '').trim(),
      contact_email: String(values.get('contact_email') || '').trim(),
      title: String(values.get('title') || '').trim(),
      target_url: String(values.get('target_url') || '').trim(),
      placement: String(values.get('placement') || 'FEED'),
      message: String(values.get('message') || '').trim() || null,
    })
    setBusy(false)
    if (error) { console.error(error); setMessage('Não foi possível enviar a solicitação.'); return }
    form.reset(); setMessage('Solicitação enviada. A equipe poderá entrar em contato pelo e-mail informado.')
    await load()
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !isAdmin) return
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    const { error } = await supabase.from('ad_campaigns').insert({
      advertiser_name: String(values.get('advertiser_name') || '').trim(), title: String(values.get('title') || '').trim(), body: String(values.get('body') || '').trim(),
      image_url: String(values.get('image_url') || '').trim() || null, target_url: String(values.get('target_url') || '').trim(), placement: String(values.get('placement') || 'FEED'),
      status: String(values.get('status') || 'DRAFT'), weight: Number(values.get('weight') || 1), created_by: user?.id || null,
    })
    setBusy(false)
    if (error) { console.error(error); setMessage('Não foi possível criar a campanha.'); return }
    form.reset(); setMessage('Campanha criada.'); await load()
  }

  async function setCampaignStatus(id: string, status: AdCampaign['status']) {
    if (!supabase || !isAdmin) return
    const { error } = await supabase.from('ad_campaigns').update({ status }).eq('id', id)
    if (error) setMessage('Não foi possível atualizar a campanha.')
    else await load()
  }

  return (
    <>
      <NovaHeader title="Publicidade" />
      <main className="advertise-page">
        <section className="advertise-hero"><div><p className="eyebrow">Publicidade nativa</p><h1>Anúncios que parecem pertencer ao Archive Nova — sem fingir que não são anúncios.</h1><p>Campanhas aparecem como cartões claramente marcados como <strong>Patrocinado</strong>. Publicidade nunca aumenta organicamente a posição de uma história no feed.</p><div className="advertise-pills"><span>✓ Identificação clara</span><span>✓ Sem pop-ups</span><span>✓ Sem autoplay</span><span>✓ Métricas de impressões e cliques</span></div></div><div className="advertise-demo"><small>PATROCINADO</small><div className="advertise-demo-art">✦</div><strong>Sua campanha aqui</strong><p>Formato integrado ao feed, inspirado em posts patrocinados.</p><b>Saiba mais →</b></div></section>

        <section className="advertise-grid">
          <div className="advertise-info-card"><p className="eyebrow">Posicionamentos</p><h2>Onde a campanha pode aparecer</h2><div><span><b>Feed</b><small>Entre recomendações e histórias recentes.</small></span><span><b>Explorar</b><small>Em áreas de descoberta e busca.</small></span><span><b>Leitor</b><small>Em pontos discretos, fora do texto do capítulo.</small></span><span><b>Sidebar</b><small>Espaços laterais em telas maiores.</small></span></div></div>
          <form className="advertise-request-form" onSubmit={submitRequest}><p className="eyebrow">Quero anunciar</p><h2>Enviar proposta</h2><label>Nome / projeto<input name="advertiser_name" required maxLength={120} /></label><label>E-mail de contato<input name="contact_email" required type="email" maxLength={320} /></label><label>Título do anúncio<input name="title" required maxLength={180} /></label><label>Link de destino<input name="target_url" required type="url" placeholder="https://…" /></label><label>Posição<select name="placement" defaultValue="FEED"><option value="FEED">Feed</option><option value="EXPLORE">Explorar</option><option value="READER">Leitor</option><option value="SIDEBAR">Sidebar</option></select></label><label>Observações<textarea name="message" rows={4} maxLength={3000} placeholder="Conte um pouco sobre a campanha." /></label><button className="primary-button" disabled={busy}>{user ? 'Enviar solicitação' : 'Entrar para solicitar'}</button></form>
        </section>

        {message ? <div className="community-message" role="status">{message}</div> : null}

        {isAdmin ? <section className="ad-admin"><header><div><p className="eyebrow">Painel interno</p><h2>Campanhas e solicitações</h2></div><span>Visível apenas para administradores</span></header><div className="ad-admin-layout"><form className="ad-campaign-form" onSubmit={createCampaign}><h3>Nova campanha</h3><input name="advertiser_name" placeholder="Anunciante" required /><input name="title" placeholder="Título" required /><textarea name="body" placeholder="Texto" rows={3} /><input name="image_url" type="url" placeholder="URL da imagem (opcional)" /><input name="target_url" type="url" placeholder="URL de destino" required /><div><select name="placement" defaultValue="FEED"><option value="FEED">Feed</option><option value="EXPLORE">Explorar</option><option value="READER">Leitor</option><option value="SIDEBAR">Sidebar</option></select><select name="status" defaultValue="DRAFT"><option value="DRAFT">Rascunho</option><option value="ACTIVE">Ativa</option></select><input name="weight" type="number" min="1" max="100" defaultValue="1" /></div><button className="primary-button" disabled={busy}>Criar campanha</button></form><div className="ad-admin-lists"><div><h3>Campanhas</h3>{campaigns.map((campaign) => <article key={campaign.id}><div><strong>{campaign.title}</strong><span>{campaign.advertiser_name} · {campaign.placement}</span><small>{campaign.impressions} impressões · {campaign.clicks} cliques</small></div><select value={campaign.status} onChange={(event) => void setCampaignStatus(campaign.id, event.target.value as AdCampaign['status'])}><option value="DRAFT">Rascunho</option><option value="ACTIVE">Ativa</option><option value="PAUSED">Pausada</option><option value="ENDED">Encerrada</option></select></article>)}</div><div><h3>Solicitações</h3>{requests.map((request) => <article key={request.id}><div><strong>{request.title}</strong><span>{request.advertiser_name} · {request.contact_email}</span><small>{request.status} · {request.placement}</small></div><a href={request.target_url} target="_blank" rel="noopener noreferrer">Abrir</a></article>)}</div></div></div></section> : null}

        <section className="advertise-footer"><span>✦</span><div><h2>Quer apoiar o projeto sem anunciar?</h2><p>O Archive Nova também possui uma página de apoio direto ao projeto.</p></div><Link className="secondary-button" href="/support">Apoiar Archive Nova</Link></section>
      </main>
    </>
  )
}
