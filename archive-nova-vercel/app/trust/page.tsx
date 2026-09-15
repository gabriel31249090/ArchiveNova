import type { Metadata } from 'next'
import Link from 'next/link'
import { NovaHeader } from '@/components/shared/nova-header'
import { NovaIcon } from '@/components/ui/nova-icon'
import { JsonLd } from '@/components/seo/json-ld'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Trust & Safety',
  description: 'Como o NovaShield auxilia a moderação do Archive Nova com triagem explicável e revisão humana.',
  alternates: { canonical: '/trust' },
  openGraph: {
    title: 'Trust & Safety · Archive Nova',
    description: 'NovaShield, revisão humana, denúncias e recursos de segurança do Archive Nova.',
    url: '/trust',
  },
  robots: { index: true, follow: true },
}

const categories = [
  ['Segurança infantil', 'Prioriza sinais de conteúdo potencialmente exploratório ou sexual envolvendo menores.', 'shield'],
  ['Terrorismo e extremismo', 'Procura contexto de promoção, propaganda, recrutamento ou instrução — não simples menções narrativas.', 'flag'],
  ['Ódio e desumanização', 'Eleva linguagem que pode incitar violência ou desumanizar grupos protegidos.', 'warning'],
  ['Autoagressão', 'Diferencia discussão temática de possíveis sinais de incentivo ou instrução.', 'heart'],
  ['Dados pessoais', 'Ajuda a localizar possíveis exposições de informações pessoais para revisão.', 'eye'],
  ['Classificação etária', 'Compara sinais de conteúdo sensível com a classificação escolhida pelo autor.', 'book'],
] as const

export default function TrustPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Trust & Safety · Archive Nova',
    url: absoluteUrl('/trust'),
    description: 'Como o Archive Nova usa NovaShield e revisão humana para priorizar moderação.',
    isPartOf: { '@type': 'WebSite', name: 'Archive Nova', url: absoluteUrl('/') },
  }

  return (
    <>
      <JsonLd value={jsonLd} />
      <NovaHeader title="Trust & Safety" />
      <main className="trust-page">
        <section className="trust-hero nova-aurora-surface">
          <div>
            <p className="eyebrow">Trust & Safety · NovaShield</p>
            <h1>Triagem automática.<br /><em>Decisão humana.</em></h1>
            <p>
              O NovaShield é uma pseudo-IA baseada em regras explicáveis. Ele organiza sinais de risco
              e ajuda a equipe a decidir o que revisar primeiro — mas não bane usuários nem remove obras sozinho.
            </p>
            <div className="trust-hero-actions">
              <Link className="primary-button large" href="/sac">Falar com o NovaCare</Link>
              <Link className="secondary-button large" href="/faq">Ler o FAQ</Link>
            </div>
          </div>
          <div className="trust-orbit" aria-hidden="true">
            <span className="trust-core"><NovaIcon name="shield" size={38} /></span>
            <i className="ring r1" /><i className="ring r2" />
            <b className="node n1">risco</b><b className="node n2">contexto</b><b className="node n3">humano</b>
          </div>
        </section>

        <section className="trust-principles">
          <article><span>01</span><h2>Sinaliza, não sentencia</h2><p>Um score alto cria prioridade de revisão. A ação final continua sendo tomada por uma pessoa da equipe.</p></article>
          <article><span>02</span><h2>Motivo visível</h2><p>Moderadores veem quais categorias dispararam, peso dos sinais e quantidade de ocorrências.</p></article>
          <article><span>03</span><h2>Contexto importa</h2><p>Literatura histórica, jornalística, crítica ou de terror pode conter palavras sensíveis sem violar as regras.</p></article>
          <article><span>04</span><h2>Falso positivo existe</h2><p>A equipe pode marcar o scan como falso positivo ou seguro e encerrar o alerta interno.</p></article>
        </section>

        <section className="trust-section">
          <div className="trust-section-heading">
            <p className="eyebrow">O que é priorizado</p>
            <h2>Categorias de risco</h2>
            <p>Essas categorias servem para triagem. O Archive Nova evita publicar a lista exata de padrões para não facilitar evasão do sistema.</p>
          </div>
          <div className="trust-category-grid">
            {categories.map(([title, description, icon]) => (
              <article key={title} className="nova-spotlight-card">
                <span><NovaIcon name={icon} size={21} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="trust-flow">
          <div className="trust-section-heading">
            <p className="eyebrow">Fluxo de moderação</p>
            <h2>Do upload à decisão</h2>
          </div>
          <ol>
            <li><b>1</b><div><strong>Publicação</strong><p>A obra entra no arquivo sem esperar um scan pesado no clique de publicar.</p></div></li>
            <li><b>2</b><div><strong>Fila automática</strong><p>O NovaShield processa pequenos lotes em background para preservar desempenho.</p></div></li>
            <li><b>3</b><div><strong>Priorização</strong><p>WATCH, REVIEW ou URGENT ajudam a equipe a ordenar a fila. Risco alto pode gerar denúncia interna.</p></div></li>
            <li><b>4</b><div><strong>Revisão humana</strong><p>O moderador abre a obra, analisa contexto e registra a decisão no histórico.</p></div></li>
          </ol>
        </section>

        <section className="trust-appeal nova-glow-surface">
          <div>
            <p className="eyebrow">Discorda de uma decisão?</p>
            <h2>Use o NovaCare.</h2>
            <p>Chamados de moderação ficam registrados, podem receber respostas da equipe e mantêm o histórico da conversa em um único lugar.</p>
          </div>
          <Link className="primary-button large" href="/sac">Abrir SAC</Link>
        </section>
      </main>
    </>
  )
}
