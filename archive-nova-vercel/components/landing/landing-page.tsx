'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compactNumber, fullNumber } from '@/lib/format'

type LandingStats = {
  works: number
  fandoms: number
  users: number
  words: number
}

type LandingFandom = {
  id: string
  name: string
  slug: string
  work_count: number
  total_words: number
}

const EMPTY_STATS: LandingStats = { works: 0, fandoms: 0, users: 0, words: 0 }

export function LandingPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  const supabase = useMemo(() => (configured ? createClient() : null), [configured])
  const [stats, setStats] = useState<LandingStats>(EMPTY_STATS)
  const [fandoms, setFandoms] = useState<LandingFandom[]>([])

  useEffect(() => {
  if (!supabase) return

  const client = supabase
  let active = true

  async function loadLandingData() {
    const [statsResponse, fandomResponse] = await Promise.all([
      client.rpc('platform_stats'),
      client.rpc('active_fandoms', { limit_count: 8 }),
    ])

      if (!active) return

      if (statsResponse.error) console.error(statsResponse.error)
      if (fandomResponse.error) console.error(fandomResponse.error)

      const rawStats = statsResponse.data as Record<string, unknown> | null
      setStats(
        rawStats
          ? {
              works: Number(rawStats.works || 0),
              fandoms: Number(rawStats.fandoms || 0),
              users: Number(rawStats.users || 0),
              words: Number(rawStats.words || 0),
            }
          : EMPTY_STATS,
      )

      setFandoms(
        ((fandomResponse.data || []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id),
          name: String(row.name),
          slug: String(row.slug),
          work_count: Number(row.work_count || 0),
          total_words: Number(row.total_words || 0),
        })),
      )
    }

    void loadLandingData()

    return () => {
      active = false
    }
  }, [supabase])

  return (
    <main className="landing-page">
      <header className="landing-nav-wrap">
        <nav className="landing-nav" aria-label="Navegação da página inicial">
          <Link className="landing-brand" href="/" aria-label="Archive Nova — início">
            <span className="landing-brand-mark" aria-hidden="true">✦</span>
            <span>
              <strong>Archive Nova</strong>
              <small>histórias sem algoritmo</small>
            </span>
          </Link>

          <div className="landing-links" aria-label="Atalhos">
            <Link href="/explore">Explorar</Link>
            <a href="#escrever">Para escritores</a>
            <a href="#arquivo">Sobre o arquivo</a>
          </div>

          <div className="landing-nav-actions">
            <Link className="landing-login" href="/explore">Entrar</Link>
            <Link className="landing-button small" href="/explore">Abrir arquivo</Link>
          </div>
        </nav>
      </header>

      <section className="landing-hero" id="arquivo">
        <div className="landing-hero-copy">
          <div className="landing-kicker"><span /> Arquivo comunitário independente</div>
          <h1>
            Histórias merecem um lugar para <em>continuar existindo.</em>
          </h1>
          <p>
            Leia, escreva e organize ficção em um arquivo feito para pessoas — com busca detalhada,
            fandoms, tags legíveis e uma biblioteca que não depende de um feed escolhendo por você.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-button" href="/explore">Explorar histórias <span>→</span></Link>
            <Link className="landing-button secondary" href="/explore">Começar a escrever</Link>
          </div>
          <div className="landing-proof" aria-label="Estatísticas atuais do Archive Nova">
            <span><strong>{fullNumber(stats.works)}</strong> obras</span>
            <span><strong>{fullNumber(stats.fandoms)}</strong> fandoms</span>
            <span><strong>{fullNumber(stats.users)}</strong> contas</span>
          </div>
        </div>

        <div className="landing-hero-art" aria-label="Prévia conceitual do Archive Nova">
          <div className="archive-window">
            <div className="archive-window-top">
              <div className="archive-dots"><span /><span /><span /></div>
              <span className="archive-window-label">ARCHIVE / READER</span>
            </div>
            <div className="archive-document">
              <span className="archive-overline">CAPÍTULO 01</span>
              <div className="archive-title-line" />
              <div className="archive-title-line short" />
              <div className="archive-paragraph"><i /><i /><i /><i /></div>
              <div className="archive-paragraph second"><i /><i /><i /></div>
              <div className="archive-foot">
                <span>Sem distrações</span>
                <span>{compactNumber(stats.words)} palavras arquivadas</span>
              </div>
            </div>
          </div>
          <div className="floating-note note-one"><span>♡</span><strong>Guarde</strong><small>sua próxima leitura</small></div>
          <div className="floating-note note-two"><span>✦</span><strong>Descubra</strong><small>por tags e fandoms</small></div>
        </div>
      </section>

      <section className="landing-fandom-strip" aria-label="Fandoms ativos">
        <div className="landing-strip-label">NO ARQUIVO AGORA</div>
        <div className="landing-fandom-list">
          {fandoms.length ? fandoms.map((fandom) => (
            <Link key={fandom.id} href="/explore" title={`${fandom.work_count} obras`}>
              <span>✦</span>{fandom.name}<small>{fandom.work_count}</small>
            </Link>
          )) : <span className="landing-empty-inline">Os fandoms publicados aparecerão aqui.</span>}
        </div>
      </section>

      <section className="landing-section" id="escrever">
        <div className="landing-section-heading">
          <span>FEITO PARA O TEXTO</span>
          <h2>Da primeira frase até a última revisão.</h2>
          <p>O Archive Nova está sendo construído para tornar escrever e publicar tão confortável quanto ler.</p>
        </div>

        <div className="landing-feature-grid">
          <article className="landing-feature-card featured">
            <div className="feature-number">01</div>
            <div className="feature-editor-mini" aria-hidden="true">
              <div className="editor-mini-toolbar"><b>B</b><i>I</i><span>H1</span><span>“</span><span>↶</span><span>↷</span></div>
              <div className="editor-mini-sheet">
                <strong>Uma página que sai do caminho.</strong>
                <span /><span /><span className="small" />
              </div>
            </div>
            <h3>Escrita sem ruído</h3>
            <p>Um espaço dedicado para escrever, revisar e continuar rascunhos sem transformar cada capítulo em um formulário.</p>
          </article>

          <article className="landing-feature-card">
            <div className="feature-number">02</div>
            <div className="feature-icon">⌕</div>
            <h3>Busca que respeita detalhes</h3>
            <p>Encontre obras por fandom, classificação, status, palavras e tags — inclusive excluindo o que você não quer ler.</p>
          </article>

          <article className="landing-feature-card">
            <div className="feature-number">03</div>
            <div className="feature-icon">♡</div>
            <h3>Seu arquivo pessoal</h3>
            <p>Bookmarks, histórico e uma biblioteca organizada para você poder voltar exatamente para as histórias que importam.</p>
          </article>
        </div>
      </section>

      <section className="landing-manifesto">
        <div>
          <span className="manifesto-mark">✦</span>
          <p>Sem ranking secreto decidindo o que merece ser encontrado.</p>
        </div>
        <blockquote>“O arquivo existe para preservar a escolha do leitor — e a voz de quem escreve.”</blockquote>
      </section>

      <section className="landing-cta">
        <div>
          <span>ARCHIVE NOVA</span>
          <h2>Tem uma história esperando para ser encontrada.</h2>
        </div>
        <div className="landing-cta-actions">
          <Link className="landing-button light" href="/explore">Entrar no arquivo <span>→</span></Link>
          <small>{fullNumber(stats.words)} palavras publicadas até agora.</small>
        </div>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand compact" href="/">
          <span className="landing-brand-mark" aria-hidden="true">✦</span>
          <strong>Archive Nova</strong>
        </Link>
        <p>Um arquivo comunitário de histórias.</p>
        <Link href="/explore">Explorar o acervo →</Link>
      </footer>
    </main>
  )
}
