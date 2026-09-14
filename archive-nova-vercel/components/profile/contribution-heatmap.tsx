'use client'

import { useMemo } from 'react'

type Day = { date: string; count: number }

export function ContributionHeatmap({ days }: { days: Day[] }) {
  const normalized = useMemo(() => {
    const map = new Map(days.map((item) => [item.date.slice(0, 10), Number(item.count || 0)]))
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - 364)
    const pad = start.getDay()
    const cells: Array<{ date: string; count: number; empty?: boolean }> = Array.from({ length: pad }, () => ({ date: '', count: 0, empty: true }))
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      cells.push({ date: key, count: map.get(key) || 0 })
    }
    return cells
  }, [days])

  const total = days.reduce((sum, item) => sum + Number(item.count || 0), 0)
  const level = (count: number) => count <= 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4

  return (
    <section className="contribution-heatmap-card">
      <header><div><p className="eyebrow">Contribuições</p><h2>{total} contribuições no último ano</h2></div><small>Capítulos publicados, posts e contribuições aceitas.</small></header>
      <div className="contribution-scroll">
        <div className="contribution-week-labels"><span>Seg</span><span>Qua</span><span>Sex</span></div>
        <div className="contribution-grid" aria-label={`${total} contribuições no último ano`}>
          {normalized.map((item, index) => item.empty ? <span className="empty" key={`empty-${index}`} /> : <span key={item.date} className={`level-${level(item.count)}`} title={`${item.date}: ${item.count} contribuição${item.count === 1 ? '' : 'ões'}`} />)}
        </div>
      </div>
      <footer><span>Menos</span>{[0,1,2,3,4].map((value) => <i key={value} className={`level-${value}`} />)}<span>Mais</span></footer>
    </section>
  )
}
