'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { TaxonomyPicker } from '@/components/taxonomy/taxonomy-picker'
import { clearLocalWriterDraft, htmlToPlainText, readLocalWriterDraft, sanitizeStoryHtml, type LocalWriterDraft } from '@/lib/writer-draft'

const STEPS = ['Informações', 'Fandoms e tags', 'Classificação', 'Revisão'] as const

export function PublishWizard() {
  const router = useRouter()
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])

  const [draft, setDraft] = useState<LocalWriterDraft | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState('ONGOING')
  const [expected, setExpected] = useState('')
  const [language, setLanguage] = useState('pt-BR')
  const [allowComments, setAllowComments] = useState(true)
  const [fandoms, setFandoms] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [rating, setRating] = useState('GENERAL')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = readLocalWriterDraft()
    setDraft(saved)
    setTitle(saved?.title || '')
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true)
      return
    }
    const client = supabase
    void client.auth.getUser().then(({ data }) => {
      setUser(data.user || null)
      setAuthChecked(true)
    })
  }, [supabase])

  const wordCount = useMemo(() => htmlToPlainText(draft?.content || '').split(/\s+/u).filter(Boolean).length, [draft?.content])
  const chapterPreview = useMemo(() => htmlToPlainText(draft?.content || '').slice(0, 720), [draft?.content])

  const validateStep = useCallback((targetStep: number) => {
    if (targetStep === 0 && !title.trim()) return 'Dê um título à obra antes de continuar.'
    if (targetStep === 1 && fandoms.length === 0) return 'Escolha pelo menos um fandom.'
    return ''
  }, [fandoms.length, title])

  const next = () => {
    const message = validateStep(step)
    if (message) {
      setError(message)
      return
    }
    setError('')
    setStep((current) => Math.min(STEPS.length - 1, current + 1))
  }

  async function publish() {
    if (!supabase || !draft || !user) return
    const firstError = validateStep(0) || validateStep(1)
    if (firstError) {
      setError(firstError)
      return
    }
    if (!htmlToPlainText(draft.content)) {
      setError('O primeiro capítulo está vazio.')
      return
    }

    setBusy(true)
    setError('')
    const { data, error: publishError } = await supabase.rpc('publish_work', {
      work_title: title.trim(),
      work_summary: summary.trim(),
      work_rating: rating,
      work_status: status,
      fandom_names: fandoms,
      tag_names: tags,
      chapter_title: draft.chapterTitle.trim() || null,
      chapter_content: sanitizeStoryHtml(draft.content),
      expected_chapter_count: expected ? Number(expected) : null,
      work_language: language,
      allow_comments_input: allowComments,
    })
    setBusy(false)

    if (publishError) {
      console.error(publishError)
      setError(publishError.message || 'Não foi possível publicar a obra.')
      return
    }

    clearLocalWriterDraft()
    router.push(`/works/${String(data)}/manage?published=1`)
  }

  if (!configured) {
    return <main className="publish-page"><div className="publish-gate"><span>✦</span><h1>Supabase não configurado</h1><p>Configure as variáveis de ambiente antes de publicar.</p></div></main>
  }

  if (!authChecked) {
    return <main className="publish-page"><div className="publish-gate"><span className="publish-loader" /><h1>Preparando publicação…</h1></div></main>
  }

  if (!user) {
    return (
      <main className="publish-page">
        <div className="publish-gate">
          <span>✦</span>
          <p className="eyebrow">Publicação</p>
          <h1>Entre na sua conta para publicar.</h1>
          <p>Seu texto continua salvo neste navegador. Depois do login, volte para esta página.</p>
          <div className="publish-gate-actions">
            <Link className="primary-button large" href="/explore?auth=login&return=/publish">Entrar</Link>
            <Link className="ghost-button large" href="/write">Voltar ao editor</Link>
          </div>
        </div>
      </main>
    )
  }

  if (!draft) {
    return (
      <main className="publish-page">
        <div className="publish-gate">
          <span>✎</span>
          <p className="eyebrow">Nenhum texto encontrado</p>
          <h1>Escreva antes de publicar.</h1>
          <p>O fluxo de publicação usa o texto salvo pelo Archive Nova Writer neste navegador.</p>
          <Link className="primary-button large" href="/write">Abrir editor</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="publish-page">
      <header className="publish-topbar">
        <Link className="publish-brand" href="/"><span>✦</span><strong>Archive Nova</strong></Link>
        <div className="publish-top-actions"><Link href="/write">← Voltar ao editor</Link><Link href="/explore">Explorar</Link></div>
      </header>

      <div className="publish-shell">
        <aside className="publish-steps">
          <p className="eyebrow">Publicar obra</p>
          <h1>Prepare sua história.</h1>
          <p>Seu texto já está pronto. Agora só faltam as informações que ajudam leitores a encontrar a obra.</p>
          <ol>
            {STEPS.map((name, index) => (
              <li key={name} className={`${step === index ? 'active' : ''} ${step > index ? 'done' : ''}`}>
                <button type="button" onClick={() => { const message = index > step ? validateStep(step) : ''; if (message) setError(message); else { setError(''); setStep(index) } }}>
                  <span>{step > index ? '✓' : index + 1}</span><div><strong>{name}</strong><small>{index === 0 ? 'Título e detalhes' : index === 1 ? 'Como será encontrada' : index === 2 ? 'Público e status' : 'Confira antes de enviar'}</small></div>
                </button>
              </li>
            ))}
          </ol>
          <div className="publish-draft-card"><span>PRIMEIRO CAPÍTULO</span><strong>{draft.chapterTitle || 'Sem título'}</strong><small>{wordCount.toLocaleString('pt-BR')} palavras</small></div>
        </aside>

        <section className="publish-panel">
          <div className="publish-progress"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>

          {step === 0 ? (
            <div className="publish-step-content">
              <div className="publish-step-head"><p className="eyebrow">01 · Informações</p><h2>Conte aos leitores o que eles vão encontrar.</h2><p>Esses dados podem ser alterados depois da publicação.</p></div>
              <div className="publish-form-grid">
                <label className="span-2">Título da obra<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} placeholder="Título da obra" /></label>
                <label className="span-2">Resumo<textarea value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={20000} rows={7} placeholder="Apresente sua história sem entregar tudo…" /></label>
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ONGOING">Em andamento</option><option value="COMPLETE">Concluída</option><option value="HIATUS">Em hiato</option></select></label>
                <label>Capítulos planejados<input value={expected} onChange={(event) => setExpected(event.target.value)} type="number" min="1" placeholder="Opcional" /></label>
                <label>Idioma<select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="pt-BR">Português (Brasil)</option><option value="en">English</option><option value="es">Español</option></select></label>
                <label className="publish-switch"><input type="checkbox" checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} /><span><strong>Permitir comentários</strong><small>Leitores poderão comentar nos capítulos.</small></span></label>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="publish-step-content">
              <div className="publish-step-head"><p className="eyebrow">02 · Fandoms e tags</p><h2>Organize sem transformar tudo em formulário.</h2><p>Use fandoms para o universo principal e tags para temas, personagens, relações e características da obra.</p></div>
              <div className="publish-taxonomy-stack">
                <TaxonomyPicker kind="fandoms" label="Fandoms" values={fandoms} onChange={setFandoms} required placeholder="Ex.: Harry Potter" />
                <TaxonomyPicker kind="tags" label="Tags" values={tags} onChange={setTags} placeholder="Ex.: Slow Burn" />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="publish-step-content">
              <div className="publish-step-head"><p className="eyebrow">03 · Classificação</p><h2>Escolha para quem a obra é indicada.</h2><p>Você poderá alterar a classificação e o status depois.</p></div>
              <div className="rating-cards">
                {[
                  ['GENERAL', 'G', 'Livre', 'Conteúdo adequado para públicos gerais.'],
                  ['TEEN', 'T', 'Teen', 'Temas moderados voltados a adolescentes.'],
                  ['MATURE', 'M', 'Mature', 'Temas adultos ou conteúdo intenso.'],
                  ['EXPLICIT', 'E', 'Explicit', 'Conteúdo explícito destinado a adultos.'],
                  ['NOT_RATED', '?', 'Não classificada', 'O autor optou por não atribuir uma classificação.'],
                ].map(([value, badge, name, description]) => (
                  <button type="button" className={rating === value ? 'selected' : ''} key={value} onClick={() => setRating(value)}>
                    <span>{badge}</span><div><strong>{name}</strong><small>{description}</small></div><i>{rating === value ? '✓' : ''}</i>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="publish-step-content">
              <div className="publish-step-head"><p className="eyebrow">04 · Revisão</p><h2>Está tudo pronto para entrar no arquivo?</h2><p>Confira os dados. Depois de publicar, você poderá editar a obra e seus capítulos na área de gerenciamento.</p></div>
              <article className="publish-review-card">
                <div className="publish-review-title"><span className="rating-badge">{rating === 'GENERAL' ? 'G' : rating === 'TEEN' ? 'T' : rating === 'MATURE' ? 'M' : rating === 'EXPLICIT' ? 'E' : '?'}</span><div><h3>{title || 'Sem título'}</h3><p>{summary || 'Sem resumo.'}</p></div></div>
                <div className="publish-review-tags">{fandoms.map((item) => <span className="primary" key={item}>{item}</span>)}{tags.map((item) => <span key={item}>{item}</span>)}</div>
                <dl><div><dt>Status</dt><dd>{status === 'ONGOING' ? 'Em andamento' : status === 'COMPLETE' ? 'Concluída' : 'Em hiato'}</dd></div><div><dt>Primeiro capítulo</dt><dd>{draft.chapterTitle || 'Capítulo 1'}</dd></div><div><dt>Extensão</dt><dd>{wordCount.toLocaleString('pt-BR')} palavras</dd></div><div><dt>Comentários</dt><dd>{allowComments ? 'Permitidos' : 'Desativados'}</dd></div></dl>
                <div className="publish-preview"><span>PRÉVIA</span><p>{chapterPreview}{htmlToPlainText(draft.content).length > 720 ? '…' : ''}</p></div>
              </article>
            </div>
          ) : null}

          {error ? <div className="publish-error" role="alert">{error}</div> : null}

          <footer className="publish-panel-actions">
            <button type="button" className="ghost-button" disabled={step === 0 || busy} onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)) }}>← Voltar</button>
            {step < STEPS.length - 1 ? <button type="button" className="primary-button" onClick={next}>Continuar →</button> : <button type="button" className="primary-button publish-final-button" disabled={busy} onClick={publish}>{busy ? 'Publicando…' : 'Publicar obra ✦'}</button>}
          </footer>
        </section>
      </div>
    </main>
  )
}
