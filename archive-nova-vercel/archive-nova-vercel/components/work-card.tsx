'use client'

import type { WorkCardData } from '@/lib/types'

function ratingShort(rating: WorkCardData['rating']) {
  return ({ GENERAL: 'G', TEEN: 'T', MATURE: 'M', EXPLICIT: 'E', NOT_RATED: '?' } as const)[rating]
}

function ratingLabel(rating: WorkCardData['rating']) {
  return ({
    GENERAL: 'Livre',
    TEEN: 'Teen',
    MATURE: 'Mature',
    EXPLICIT: 'Explicit',
    NOT_RATED: 'Não classificada',
  } as const)[rating]
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value || 0)
}

export function WorkCard({
  work,
  onOpen,
  onBookmark,
}: {
  work: WorkCardData
  onOpen: (id: string) => void
  onBookmark: (work: WorkCardData) => void
}) {
  return (
    <article className="work-card">
      <div className="work-top">
        <span className="rating-badge" title={ratingLabel(work.rating)}>{ratingShort(work.rating)}</span>
        <button
          type="button"
          className={`bookmark-btn ${work.bookmarked ? 'saved' : ''}`}
          aria-label={work.bookmarked ? 'Remover bookmark' : 'Adicionar bookmark'}
          onClick={() => onBookmark(work)}
        >
          {work.bookmarked ? '★' : '☆'}
        </button>
      </div>

      <div className="work-title-wrap">
        <h3>{work.title}</h3>
        <button className="open-work" type="button" aria-label={`Abrir ${work.title}`} onClick={() => onOpen(work.id)} />
      </div>

      <p className="author">por {work.author_display_name || work.author_username}</p>
      <p className="summary">{work.summary || 'Sem resumo.'}</p>

      <div className="tags">
        {work.fandoms.slice(0, 2).map((tag) => <span className="tag" key={`f-${tag}`}>{tag}</span>)}
        {work.tags.slice(0, 4).map((tag) => <span className="tag" key={`t-${tag}`}>{tag}</span>)}
      </div>

      <div className="work-meta">
        <span>{formatNumber(work.word_count)} palavras</span>
        <span>{work.chapter_count}{work.expected_chapters ? `/${work.expected_chapters}` : ''} cap.</span>
        <span>♥ {formatNumber(work.kudos_count)}</span>
        <span>◌ {formatNumber(work.hits_count)}</span>
      </div>
    </article>
  )
}
