'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '@tiptap/react'
import { FONT_OPTIONS, FONT_SIZE_OPTIONS, LINE_HEIGHT_OPTIONS } from '@/components/editor/editor-extensions'
import { NovaIcon } from '@/components/ui/nova-icon'

export type TiptapEditor = NonNullable<ReturnType<typeof useEditor>>

export type ImportMode = 'replace' | 'append'

export type ImportResult = {
  name: string
  title: string
  html: string
  preview: string
  words: number
  characters: number
  warnings: string[]
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  title,
  onClick,
  className = '',
}: {
  active?: boolean
  disabled?: boolean
  label: string
  title: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      className={`writer-tool-button ${active ? 'active' : ''} ${className}`}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function applyIndent(editor: TiptapEditor, value: string | null) {
  if (editor.isActive('heading')) {
    editor.chain().focus().updateAttributes('heading', { textIndent: value }).run()
  } else {
    editor.chain().focus().updateAttributes('paragraph', { textIndent: value }).run()
  }
}

export function setLink(editor: TiptapEditor) {
  const current = String(editor.getAttributes('link').href || '')
  const href = window.prompt('Cole o endereço do link:', current || 'https://')
  if (href === null) return
  if (!href.trim()) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}

export function EditorToolbar({
  editor,
  compact = false,
  onOpenFind,
}: {
  editor: TiptapEditor | null
  compact?: boolean
  onOpenFind: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)

  if (!editor) return <div className="writer-toolbar-skeleton" aria-hidden="true" />

  const activeFont = String(editor.getAttributes('textStyle').fontFamily || '')
  const activeSize = String(editor.getAttributes('textStyle').fontSize || '16px')
  const activeLineHeight = String(editor.getAttributes('textStyle').lineHeight || '1.65')
  const textColor = String(editor.getAttributes('textStyle').color || '#201b1c')
  const highlightColor = String(editor.getAttributes('highlight').color || '#fff1a8')

  return (
    <div className={`writer-toolbar-v5 ${compact ? 'compact' : ''}`} role="toolbar" aria-label="Ferramentas de formatação">
      <div className="writer-tool-group essentials">
        <ToolbarButton label="↶" title="Desfazer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton label="↷" title="Refazer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group writer-format-selects">
        <select
          className="writer-tool-select font"
          aria-label="Fonte"
          value={activeFont}
          onChange={(event) => {
            const value = event.target.value
            if (value) editor.chain().focus().setFontFamily(value).run()
            else editor.chain().focus().unsetFontFamily().run()
          }}
        >
          <option value="">Fonte</option>
          {FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
        </select>
        <select
          className="writer-tool-select size"
          aria-label="Tamanho da fonte"
          value={FONT_SIZE_OPTIONS.includes(activeSize as (typeof FONT_SIZE_OPTIONS)[number]) ? activeSize : '16px'}
          onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}
        >
          {FONT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size.replace('px', '')}</option>)}
        </select>
      </div>

      <span className="writer-tool-divider" />

      <div className="writer-tool-group essentials">
        <ToolbarButton label="B" title="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton label="I" title="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton label="U" title="Sublinhado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolbarButton label="S" title="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      </div>

      <div className={`writer-toolbar-more ${moreOpen ? 'open' : ''}`}>
        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <label className="writer-color-tool" title="Cor do texto">
            <span>A</span>
            <i style={{ background: textColor }} />
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(textColor) ? textColor : '#201b1c'}
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
              aria-label="Cor do texto"
            />
          </label>
          <label className="writer-color-tool highlight" title="Marca-texto">
            <span>▰</span>
            <i style={{ background: highlightColor }} />
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(highlightColor) ? highlightColor : '#fff1a8'}
              onChange={(event) => editor.chain().focus().setHighlight({ color: event.target.value }).run()}
              aria-label="Cor do marca-texto"
            />
          </label>
          <ToolbarButton label="x₂" title="Subscrito" active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} />
          <ToolbarButton label="x²" title="Sobrescrito" active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <select
            className="writer-tool-select paragraph"
            aria-label="Estilo do parágrafo"
            value={editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'h1') editor.chain().focus().setHeading({ level: 1 }).run()
              else if (value === 'h2') editor.chain().focus().setHeading({ level: 2 }).run()
              else if (value === 'h3') editor.chain().focus().setHeading({ level: 3 }).run()
              else editor.chain().focus().setParagraph().run()
            }}
          >
            <option value="p">Texto normal</option>
            <option value="h1">Título 1</option>
            <option value="h2">Título 2</option>
            <option value="h3">Título 3</option>
          </select>
          <select
            className="writer-tool-select line-height"
            aria-label="Espaçamento entre linhas"
            value={LINE_HEIGHT_OPTIONS.includes(activeLineHeight as (typeof LINE_HEIGHT_OPTIONS)[number]) ? activeLineHeight : '1.65'}
            onChange={(event) => editor.chain().focus().setLineHeight(event.target.value).run()}
          >
            {LINE_HEIGHT_OPTIONS.map((height) => <option key={height} value={height}>{height}×</option>)}
          </select>
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="≡" title="Alinhar à esquerda" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <ToolbarButton label="≣" title="Centralizar" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <ToolbarButton label="☷" title="Alinhar à direita" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <ToolbarButton label="▤" title="Justificar" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} />
          <ToolbarButton label="⇥" title="Recuo de primeira linha" onClick={() => applyIndent(editor, '2em')} />
          <ToolbarButton label="⇤" title="Remover recuo" onClick={() => applyIndent(editor, null)} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="•" title="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="1." title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton label="❝" title="Citação" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton label="—" title="Linha divisória" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          <ToolbarButton label="↗" title="Inserir ou editar link" active={editor.isActive('link')} onClick={() => setLink(editor)} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="▦" title="Inserir tabela 3 × 3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <ToolbarButton label="+C" title="Adicionar coluna" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <ToolbarButton label="+L" title="Adicionar linha" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().addRowAfter().run()} />
          <ToolbarButton label="−C" title="Excluir coluna" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().deleteColumn().run()} />
          <ToolbarButton label="−L" title="Excluir linha" disabled={!editor.isActive('table')} onClick={() => editor.chain().focus().deleteRow().run()} />
        </div>

        <span className="writer-tool-divider" />

        <div className="writer-tool-group">
          <ToolbarButton label="⌁" title="Inserir quebra de página" onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()} />
          <ToolbarButton label="⌕" title="Localizar e substituir" onClick={onOpenFind} />
          <ToolbarButton
            label="Tx"
            title="Limpar formatação"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run()}
          />
        </div>
      </div>

      <button
        className={`writer-more-tools-button ${moreOpen ? 'active' : ''}`}
        type="button"
        onClick={() => setMoreOpen((current) => !current)}
        aria-expanded={moreOpen}
      >
        <span>•••</span>
        <small>{moreOpen ? 'Menos' : 'Mais'}</small>
      </button>
    </div>
  )
}

export function ImportDialog({
  result,
  mode,
  loading,
  error,
  onModeChange,
  onApply,
  onClose,
}: {
  result: ImportResult | null
  mode: ImportMode
  loading: boolean
  error: string
  onModeChange: (mode: ImportMode) => void
  onApply: () => void
  onClose: () => void
}) {
  return (
    <div className="writer-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !loading) onClose() }}>
      <section className="writer-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header>
          <div><p className="eyebrow">Importar história</p><h2 id="import-title">{loading ? 'Lendo seu arquivo…' : result ? result.name : 'Não foi possível importar'}</h2></div>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Fechar"><NovaIcon name="close" size={17} /></button>
        </header>

        {loading ? (
          <div className="writer-import-loading"><span /><strong>Convertendo o documento</strong><p>Arquivos grandes e PDFs podem levar alguns segundos.</p></div>
        ) : error ? (
          <div className="writer-import-error"><span>!</span><p>{error}</p></div>
        ) : result ? (
          <>
            <div className="writer-import-stats">
              <div><strong>{result.words.toLocaleString('pt-BR')}</strong><span>palavras</span></div>
              <div><strong>{result.characters.toLocaleString('pt-BR')}</strong><span>caracteres</span></div>
              <div><strong>{result.title || '—'}</strong><span>título detectado</span></div>
            </div>

            {result.warnings.length ? (
              <div className="writer-import-warning"><strong>Observações da importação</strong>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
            ) : null}

            <div className="writer-import-preview"><span>PRÉVIA</span><p>{result.preview || 'O documento não contém texto legível.'}</p></div>

            <fieldset className="writer-import-mode">
              <legend>O que fazer com o texto que já está no editor?</legend>
              <label className={mode === 'replace' ? 'selected' : ''}><input type="radio" checked={mode === 'replace'} onChange={() => onModeChange('replace')} /><span><strong>Substituir conteúdo</strong><small>O texto atual será trocado pelo arquivo importado.</small></span></label>
              <label className={mode === 'append' ? 'selected' : ''}><input type="radio" checked={mode === 'append'} onChange={() => onModeChange('append')} /><span><strong>Inserir no final</strong><small>Mantém o conteúdo atual e adiciona o documento abaixo.</small></span></label>
            </fieldset>
          </>
        ) : null}

        <footer>
          <button className="ghost-button" type="button" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="primary-button" type="button" onClick={onApply} disabled={loading || !result}>Importar para o editor →</button>
        </footer>
      </section>
    </div>
  )
}

export function FindReplacePanel({ editor, onClose }: { editor: TiptapEditor; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchIndex, setMatchIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    if (!query) return [] as Array<{ from: number; to: number }>
    const needle = query.toLocaleLowerCase('pt-BR')
    const found: Array<{ from: number; to: number }> = []
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const haystack = node.text.toLocaleLowerCase('pt-BR')
      let offset = 0
      while (offset <= haystack.length - needle.length) {
        const index = haystack.indexOf(needle, offset)
        if (index < 0) break
        found.push({ from: pos + index, to: pos + index + query.length })
        offset = index + Math.max(1, query.length)
      }
    })
    return found
  }, [editor, query, editor.state.doc.content.size])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => setMatchIndex(matches.length ? 0 : -1), [query, matches.length])

  const selectMatch = (index: number) => {
    if (!matches.length) return
    const normalized = (index + matches.length) % matches.length
    const match = matches[normalized]
    setMatchIndex(normalized)
    editor.chain().focus().setTextSelection(match).scrollIntoView().run()
  }

  const replaceCurrent = () => {
    if (!matches.length) return
    const index = matchIndex < 0 ? 0 : Math.min(matchIndex, matches.length - 1)
    const match = matches[index]
    editor.chain().focus().insertContentAt(match, replacement).run()
  }

  const replaceAll = () => {
    if (!matches.length) return
    const transaction = editor.state.tr
    for (const match of [...matches].reverse()) transaction.insertText(replacement, match.from, match.to)
    editor.view.dispatch(transaction)
  }

  return (
    <div className="writer-find-panel" role="search">
      <div className="writer-find-row">
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Localizar…" aria-label="Localizar" />
        <span>{matches.length ? `${matchIndex + 1}/${matches.length}` : '0/0'}</span>
        <button type="button" disabled={!matches.length} onClick={() => selectMatch(matchIndex - 1)} aria-label="Resultado anterior"><NovaIcon name="chevronUp" size={15} /></button>
        <button type="button" disabled={!matches.length} onClick={() => selectMatch(matchIndex + 1)} aria-label="Próximo resultado"><NovaIcon name="chevronDown" size={15} /></button>
        <button type="button" onClick={onClose} aria-label="Fechar busca"><NovaIcon name="close" size={15} /></button>
      </div>
      <div className="writer-find-row replace">
        <input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="Substituir por…" aria-label="Substituir por" />
        <button type="button" disabled={!matches.length} onClick={replaceCurrent}>Substituir</button>
        <button type="button" disabled={!matches.length} onClick={replaceAll}>Tudo</button>
      </div>
    </div>
  )
}

