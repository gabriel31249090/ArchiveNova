export function fullNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat('pt-BR').format(Number(value || 0))
}

export function compactNumber(value: number | string | null | undefined) {
  const number = Number(value || 0)
  return new Intl.NumberFormat('pt-BR', {
    notation: number >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(number)
}

export function splitLabels(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)))
}

export function ratingLabel(value: string) {
  return ({
    GENERAL: 'Livre',
    TEEN: 'Teen',
    MATURE: 'Mature',
    EXPLICIT: 'Explicit',
    NOT_RATED: 'Não classificada',
  } as Record<string, string>)[value] || value
}

export function formatDate(value: string | null | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
