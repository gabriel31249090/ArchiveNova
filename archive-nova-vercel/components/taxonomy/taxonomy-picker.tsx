'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type TaxonomyKind = 'fandoms' | 'tags'

type TaxonomySuggestion = {
  id: string
  name: string
}

function uniqueLabels(values: string[]) {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLocaleLowerCase('pt-BR')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function TaxonomyPicker({
  kind,
  label,
  values,
  onChange,
  required = false,
  placeholder,
}: {
  kind: TaxonomyKind
  label: string
  values: string[]
  onChange: (values: string[]) => void
  required?: boolean
  placeholder: string
}) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<TaxonomySuggestion[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!supabase || query.trim().length < 1) {
      setSuggestions([])
      return
    }

    const client = supabase
    const timer = window.setTimeout(async () => {
      const table = kind === 'fandoms' ? 'fandoms' : 'tags'
      let request = client.from(table).select('id,name').ilike('name', `%${query.trim()}%`).limit(8)
      if (kind === 'tags') request = request.eq('type', 'FREEFORM')
      const { data, error } = await request
      if (error) {
        console.error(error)
        return
      }
      setSuggestions(((data || []) as Array<{ id: string; name: string }>).map((item) => ({ id: item.id, name: String(item.name) })))
    }, 180)

    return () => window.clearTimeout(timer)
  }, [kind, query, supabase])

  const add = (value: string) => {
    const clean = value.trim().replace(/,$/u, '')
    if (!clean) return
    onChange(uniqueLabels([...values, clean]))
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(query)
    }
    if (event.key === 'Backspace' && !query && values.length) onChange(values.slice(0, -1))
  }

  return (
    <div className="taxonomy-field">
      <div className="taxonomy-label-row">
        <label>{label}{required ? <span> *</span> : null}</label>
        <small>{values.length} selecionado{values.length === 1 ? '' : 's'}</small>
      </div>
      <div className="taxonomy-control" onClick={() => setOpen(true)}>
        {values.map((value) => (
          <span className="taxonomy-chip" key={value}>
            {value}
            <button type="button" aria-label={`Remover ${value}`} onClick={(event) => { event.stopPropagation(); onChange(values.filter((item) => item !== value)) }}>×</button>
          </span>
        ))}
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={values.length ? 'Adicionar mais…' : placeholder}
          maxLength={220}
        />
      </div>
      {open && query.trim() ? (
        <div className="taxonomy-suggestions">
          {suggestions.filter((item) => !values.some((value) => value.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR'))).map((item) => (
            <button type="button" key={item.id} onClick={() => add(item.name)}>
              <span>✦</span><strong>{item.name}</strong><small>{kind === 'fandoms' ? 'Fandom existente' : 'Tag existente'}</small>
            </button>
          ))}
          <button type="button" className="taxonomy-create" onClick={() => add(query)}>
            <span>＋</span><strong>Usar “{query.trim()}”</strong><small>Criar se ainda não existir</small>
          </button>
        </div>
      ) : null}
      <p className="taxonomy-hint">Digite e pressione Enter. Sugestões existentes aparecem enquanto você escreve.</p>
    </div>
  )
}
