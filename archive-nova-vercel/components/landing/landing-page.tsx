'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compactNumber, fullNumber } from '@/lib/format'
import { NovaIcon, type NovaIconName } from '@/components/ui/nova-icon'

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

const PLATFORM_FEATURES: ReadonlyArray<readonly [string, string, string, NovaIconName]> = [
  ['Writer Cloud', 'Rascunhos sincronizados entre dispositivos, autosave e capítulos organizados.', '/write', 'cloud'],
  ['Feed transparente', 'Recomendações com o motivo de cada história aparecer para você.', '/feed', 'feed'],
  ['Posts da comunidade', 'Atualizações, imagens, enquetes e conversas entre leitores e escritores.', '/posts', 'posts'],
  ['Colaboração revisável', 'Contribuições inspiradas em pull requests: revisar, pedir mudanças e mesclar.', '/faq', 'branch'],
  ['Apoio direto', 'Autores podem compartilhar PIX e outros meios de apoio sem intermediação.', '/support', 'heart'],
  ['Busca sem ranking secreto', 'Fandoms, tags, classificação, tamanho e filtros continuam sob seu controle.', '/explore', 'search'],
]

export function LandingPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  const supabase = useMemo(() => (configured ? createClient() : null), [configured])
  const [stats, setStats] = useState<LandingStats>(EMPTY_STATS)
  const [fandoms, setFandoms] = useState<LandingFandom[]>([])
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setDataReady(true)
      return
    }

    const client = supabase
    let active = true

    async function loadLandingData() {
      const [statsResponse, fandomResponse] = await Promise.all([
        client.rpc('platform_stats'),
        client.rpc('active_fandoms', { limit_count: 10 }),
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
      setDataReady(true)
    }

    void loadLandingData()

    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    const root = document.documentElement
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-landing-reveal]'))
    root.classList.add('landing-motion-ready')

    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'))
      return () => root.classList.remove('landing-motion-ready')
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )

    elements.forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      root.classList.remove('landing-motion-ready')
    }
  }, [])

  const statValue = (value: number) => (dataReady ? fullNumber(value) : '—')

  return (
    <main className="landing-page landing-v4">
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
            <Link href="/feed">Feed</Link>
            <Link href="/posts">Posts</Link>
            <Link href="/faq">FAQ</Link>
          </div>

          <div className="landing-nav-actions">
            <Link className="landing-login" href="/explore?auth=login&return=%2Fexplore">Entrar</Link>
            <Link className="landing-button small" href="/write">Escrever</Link>
          </div>
        </nav>
      </header>

      <section className="landing-hero landing-v4-hero" id="arquivo">
        <div className="landing-hero-copy landing-v4-copy">
          <div className="landing-v4-badge-row">
            <div className="landing-kicker"><span /> Archive Nova v4</div>
            <span className="landing-v4-live"><i /> comunidade + escrita</span>
          </div>

          <h1>
            Histórias merecem um lugar para <em>continuar existindo.</em>
          </h1>
          <p>
            Leia, escreva, publique, converse e colabore em um arquivo comunitário feito para pessoas.
            O Archive Nova reúne busca detalhada, Writer Cloud, posts, feed transparente e ferramentas
            de colaboração sem esconder suas escolhas atrás de um ranking secreto.
          </p>

          <div className="landing-hero-actions">
            <Link className="landing-button" href="/explore">Entrar no arquivo <span>→</span></Link>
            <Link className="landing-button secondary" href="/write">Começar a escrever</Link>
          </div>

          <div className="landing-v4-trust">
            <span><b aria-hidden="true">✦</b> recomendações explicáveis</span>
            <span><b><NovaIcon name="cloud" size={15} /></b> rascunhos na nuvem</span>
            <span><b><NovaIcon name="branch" size={15} /></b> colaboração revisável</span>
          </div>
        </div>

        <div className="landing-v4-stage" aria-label="Prévia conceitual do Archive Nova">
          <div className="landing-v4-glow" />
          <div className="landing-v4-orbit orbit-a" />
          <div className="landing-v4-orbit orbit-b" />

          <div className="landing-v4-app-preview">
            <header>
              <div className="archive-dots"><span /><span /><span /></div>
              <strong>ARCHIVE NOVA / FEED</strong>
              <span className="landing-v4-preview-live"><i /> LIVE</span>
            </header>
            <div className="landing-v4-preview-body">
              <aside>
                <span className="active"><NovaIcon name="archive" size={15} /></span>
                <span><NovaIcon name="search" size={15} /></span>
                <span><NovaIcon name="posts" size={15} /></span>
                <span><NovaIcon name="heart" size={15} /></span>
                <span><NovaIcon name="write" size={15} /></span>
              </aside>
              <section>
                <div className="landing-v4-preview-search"><NovaIcon name="search" size={14} /> <span>buscar histórias, tags, fandoms…</span></div>
                <div className="landing-v4-preview-reason">✦ Porque você acompanha este fandom</div>
                <article>
                  <div className="landing-v4-preview-cover">A</div>
                  <div>
                    <small>FANDOM · EM ANDAMENTO</small>
                    <h3>Uma história esperando para ser encontrada</h3>
                    <p>Tags legíveis, leitura confortável e contexto antes de você abrir.</p>
                    <div><span>slow burn</span><span>found family</span><span>aventura</span></div>
                  </div>
                </article>
                <article className="secondary-preview">
                  <div className="landing-v4-preview-cover alt">N</div>
                  <div>
                    <small>RECÉM-PUBLICADA</small>
                    <h3>Novas vozes entram no arquivo todos os dias</h3>
                  </div>
                </article>
              </section>
            </div>
          </div>

          <div className="landing-v4-float float-cloud">
            <span><NovaIcon name="cloud" size={17} /></span><div><strong>Writer Cloud</strong><small>salvo automaticamente</small></div><b><NovaIcon name="check" size={15} /></b>
          </div>
          <div className="landing-v4-float float-collab">
            <span><NovaIcon name="branch" size={17} /></span><div><strong>Contribuição #14</strong><small>pronta para revisão</small></div><b><NovaIcon name="check" size={15} /></b>
          </div>
          <div className="landing-v4-float float-post">
            <span><NovaIcon name="posts" size={17} /></span><div><strong>Comunidade</strong><small>posts, enquetes e comentários</small></div>
          </div>
        </div>
      </section>

      <section className="landing-v4-metrics" aria-label="Estatísticas atuais do Archive Nova" data-landing-reveal>
        <div><strong>{statValue(stats.works)}</strong><span>obras públicas</span></div>
        <div><strong>{statValue(stats.fandoms)}</strong><span>fandoms</span></div>
        <div><strong>{statValue(stats.users)}</strong><span>contas</span></div>
        <div><strong>{dataReady ? compactNumber(stats.words) : '—'}</strong><span>palavras arquivadas</span></div>
      </section>

      <section className="landing-fandom-strip" aria-label="Fandoms ativos" data-landing-reveal>
        <div className="landing-strip-label">NO ARQUIVO AGORA</div>
        <div className="landing-fandom-list">
          {!dataReady ? (
            <>
              <span className="landing-v4-chip-skeleton" />
              <span className="landing-v4-chip-skeleton" />
              <span className="landing-v4-chip-skeleton" />
            </>
          ) : fandoms.length ? fandoms.map((fandom) => (
            <Link key={fandom.id} href="/explore" title={fandom.work_count + ' obras'}>
              <span>✦</span>{fandom.name}<small>{fandom.work_count}</small>
            </Link>
          )) : <span className="landing-empty-inline">Os fandoms publicados aparecerão aqui.</span>}
        </div>
      </section>

      <section className="landing-section landing-v4-section" id="recursos" data-landing-reveal>
        <div className="landing-section-heading">
          <span>O ARCHIVE NOVA HOJE</span>
          <h2>Mais que um lugar para publicar capítulos.</h2>
          <p>
            A plataforma cresceu para acompanhar o processo inteiro: descobrir, escrever, revisar,
            colaborar, conversar com a comunidade e apoiar quem cria.
          </p>
        </div>

        <div className="landing-v4-feature-grid">
          {PLATFORM_FEATURES.map(([title, description, href, icon], index) => (
            <Link className={'landing-v4-feature-card feature-' + (index + 1)} href={href} key={title}>
              <div className="landing-v4-feature-top"><span><NovaIcon name={icon} size={21} /></span><small>0{index + 1}</small></div>
              <h3>{title}</h3>
              <p>{description}</p>
              <b>Conhecer recurso →</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-v4-writer" data-landing-reveal>
        <div className="landing-v4-writer-copy">
          <p className="landing-kicker"><span /> Para escritores</p>
          <h2>Do primeiro rascunho à publicação, sem trocar de ferramenta.</h2>
          <p>
            O Writer Pro oferece formatação rica, modos de foco e leitura, capítulos, autosave,
            sincronização entre dispositivos e importação de documentos.
          </p>
          <div className="landing-v4-format-list">
            <span>DOCX</span><span>PDF</span><span>TXT</span><span>Markdown</span><span>HTML</span><span>RTF</span>
          </div>
          <Link className="landing-button" href="/write">Abrir Writer <span>→</span></Link>
        </div>

        <div className="landing-v4-editor-demo" aria-hidden="true">
          <div className="landing-v4-editor-toolbar">
            <span>↶</span><span>↷</span><i />
            <b>Serif</b><b>18</b><i />
            <strong>B</strong><em>I</em><u>U</u><span>≡</span><span>☷</span>
          </div>
          <div className="landing-v4-editor-sheet">
            <small>CAPÍTULO 07</small>
            <h3>A cidade que lembrava nossos nomes</h3>
            <p>O cursor piscava como se também estivesse esperando pela próxima frase.</p>
            <p>Do lado de fora, a chuva desenhava pequenas linhas na janela.</p>
            <span className="landing-v4-caret" />
          </div>
          <div className="landing-v4-save-state"><i /> Salvo na nuvem</div>
        </div>
      </section>

      <section className="landing-v4-community" data-landing-reveal>
        <div className="landing-v4-community-preview">
          <div className="landing-v4-post-card">
            <header><span>AN</span><div><strong>Archive Nova</strong><small>@archivenova · agora</small></div><b>•••</b></header>
            <p>Uma história não precisa terminar quando o autor fecha o editor. Ela pode continuar em leitores, comentários, revisões e novas contribuições.</p>
            <div className="landing-v4-poll">
              <span><i style={{ width: '72%' }} />Mais capítulos</span>
              <span><i style={{ width: '46%' }} />Nova história</span>
            </div>
            <footer><span><NovaIcon name="heart" size={13} />128</span><span><NovaIcon name="posts" size={13} />34</span><span><NovaIcon name="share" size={13} />compartilhar</span></footer>
          </div>
          <div className="landing-v4-contribution-card">
            <span><NovaIcon name="branch" size={19} /></span>
            <div><small>CONTRIBUIÇÃO</small><strong>Correção de continuidade no capítulo 4</strong><p>2 revisões · pronta para mesclar</p></div>
            <b><NovaIcon name="check" size={16} /></b>
          </div>
        </div>

        <div className="landing-v4-community-copy">
          <p className="landing-kicker"><span /> Comunidade</p>
          <h2>Leitores também fazem parte do arquivo.</h2>
          <p>
            Posts, enquetes, comentários, seguidores e contribuições deixam o Archive Nova vivo
            sem transformar popularidade em uma regra invisível de distribuição.
          </p>
          <div className="landing-v4-community-actions">
            <Link className="landing-button" href="/posts">Ver posts</Link>
            <Link className="landing-button secondary" href="/feed">Abrir feed</Link>
          </div>
        </div>
      </section>

      <section className="landing-manifesto landing-v4-manifesto" data-landing-reveal>
        <div>
          <span className="manifesto-mark">✦</span>
          <p>Publicidade é identificada. Recomendações explicam o motivo. A escolha continua sendo sua.</p>
        </div>
        <blockquote>“Preservar histórias também significa preservar a autonomia de quem lê e de quem escreve.”</blockquote>
      </section>

      <section className="landing-cta landing-v4-cta" data-landing-reveal>
        <div>
          <span>ARCHIVE NOVA · V4</span>
          <h2>Leia uma história. Escreva outra. Ajude uma terceira a ficar ainda melhor.</h2>
        </div>
        <div className="landing-cta-actions">
          <Link className="landing-button light" href="/explore">Entrar no Archive Nova <span>→</span></Link>
          <small>{dataReady ? fullNumber(stats.words) : '—'} palavras publicadas até agora.</small>
        </div>
      </section>

      <footer className="landing-footer landing-v4-footer">
        <Link className="landing-brand compact" href="/">
          <span className="landing-brand-mark" aria-hidden="true">✦</span>
          <strong>Archive Nova</strong>
        </Link>
        <p>Um arquivo comunitário de histórias.</p>
        <div>
          <Link href="/explore">Explorar</Link>
          <Link href="/feed">Feed</Link>
          <Link href="/posts">Posts</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/support">Apoiar</Link>
        </div>
      </footer>
    </main>
  )
}
