'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clearLocalWriterDraft, htmlToPlainText, readLocalWriterDraft } from '@/lib/writer-draft'
import { StoryEditor } from '@/components/editor/story-editor'

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

export function WriterStart() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const supabase = useMemo(() => configured ? createClient() : null, [configured])
  const [mode, setMode] = useState<'checking' | 'local' | 'error'>('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) { setMode('local'); return }
    const client = supabase
    void (async () => {
      const { data } = await client.auth.getUser()
      if (!data.user) { setMode('local'); return }

      const local = readLocalWriterDraft()
      const words = local ? htmlToPlainText(local.content).split(/\s+/u).filter(Boolean).length : 0
      const { data: created, error: createError } = await client.rpc('create_writer_draft', {
        initial_title: local?.title || '',
        initial_chapter_title: local?.chapterTitle || '',
        initial_content_html: local?.content || '<p></p>',
        initial_content_json: EMPTY_DOC,
        initial_word_count: words,
      })
      if (createError || !created) {
        console.error(createError)
        setError('Não foi possível criar o rascunho na nuvem. Seu texto local continua seguro neste navegador.')
        setMode('error')
        return
      }
      const id = String((created as Record<string, unknown>).id || '')
      if (!id) { setError('O Supabase não retornou o novo rascunho.'); setMode('error'); return }
      if (local) clearLocalWriterDraft()
      window.location.replace(`/write/${id}`)
    })()
  }, [supabase])

  if (mode === 'local') return <StoryEditor />
  if (mode === 'error') return <><StoryEditor /><div className="writer-cloud-global-error" role="alert">{error}</div></>
  return <main className="writer-cloud-loading"><span>✦</span><h1>Preparando seu rascunho…</h1><p>Conectando o Writer Pro ao Archive Nova.</p></main>
}
