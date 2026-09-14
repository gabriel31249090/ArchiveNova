'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createArchiveEditorExtensions, FONT_OPTIONS, FONT_SIZE_OPTIONS } from '@/components/editor/editor-extensions'

type TiptapEditor = NonNullable<ReturnType<typeof useEditor>>

function normalizeEditorValue(value: string) {
  if (!value.trim()) return '<p></p>'
  if (/<\/?(?:p|h[1-3]|ul|ol|li|blockquote|strong|em|u|s|hr|br|span|mark|a|table|sup|sub|div)\b/i.test(value)) return value
  const escaped = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  return escaped.split(/\n{2,}/u).map((block) => `<p>${block.replaceAll('\n', '<br>')}</p>`).join('')
}

function RichButton({ editor, name, label, title, action }: { editor: TiptapEditor | null; name?: string; label: string; title: string; action: () => void }) {
  return <button type="button" title={title} aria-label={title} className={name && editor?.isActive(name) ? 'active' : ''} onClick={action}>{label}</button>
}

export function RichTextField({
  value,
  onChange,
  placeholder = 'Escreva…',
  minHeight = 320,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const extensions = useMemo(() => createArchiveEditorExtensions(placeholder), [placeholder])

  const editor = useEditor({
    extensions,
    content: normalizeEditorValue(value),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'manage-rich-content story-editor-pro', spellcheck: 'true' } },
    onUpdate: ({ editor: currentEditor }: { editor: TiptapEditor }) => onChange(currentEditor.getHTML()),
  })

  useEffect(() => {
    if (!editor) return
    const next = normalizeEditorValue(value)
    if (editor.getHTML() !== next) editor.commands.setContent(next, { emitUpdate: false })
  }, [editor, value])

  const setLink = () => {
    if (!editor) return
    const current = String(editor.getAttributes('link').href || '')
    const href = window.prompt('Cole o endereço do link:', current || 'https://')
    if (href === null) return
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
  }

  return (
    <div className="manage-rich-editor manage-rich-editor-v5" style={{ '--manage-editor-min-height': `${minHeight}px` } as CSSProperties}>
      <div className="manage-rich-toolbar manage-rich-toolbar-v5" role="toolbar" aria-label="Formatação do capítulo">
        <select aria-label="Fonte" onChange={(event) => event.target.value ? editor?.chain().focus().setFontFamily(event.target.value).run() : editor?.chain().focus().unsetFontFamily().run()}>
          <option value="">Fonte</option>
          {FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
        </select>
        <select aria-label="Tamanho da fonte" defaultValue="16px" onChange={(event) => editor?.chain().focus().setFontSize(event.target.value).run()}>
          {FONT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size.replace('px', '')}</option>)}
        </select>
        <RichButton editor={editor} name="bold" label="B" title="Negrito" action={() => editor?.chain().focus().toggleBold().run()} />
        <RichButton editor={editor} name="italic" label="I" title="Itálico" action={() => editor?.chain().focus().toggleItalic().run()} />
        <RichButton editor={editor} name="underline" label="U" title="Sublinhado" action={() => editor?.chain().focus().toggleUnderline().run()} />
        <button className={moreOpen ? 'active' : ''} type="button" onClick={() => setMoreOpen((current) => !current)} aria-label="Mais formatações">•••</button>

        {moreOpen ? <div className="manage-rich-more">
          <RichButton editor={editor} name="strike" label="S" title="Tachado" action={() => editor?.chain().focus().toggleStrike().run()} />
          <RichButton editor={editor} name="subscript" label="x₂" title="Subscrito" action={() => editor?.chain().focus().toggleSubscript().run()} />
          <RichButton editor={editor} name="superscript" label="x²" title="Sobrescrito" action={() => editor?.chain().focus().toggleSuperscript().run()} />
          <RichButton editor={editor} label="H2" title="Título 2" action={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
          <RichButton editor={editor} label="•" title="Lista" action={() => editor?.chain().focus().toggleBulletList().run()} />
          <RichButton editor={editor} label="1." title="Lista numerada" action={() => editor?.chain().focus().toggleOrderedList().run()} />
          <RichButton editor={editor} label="❝" title="Citação" action={() => editor?.chain().focus().toggleBlockquote().run()} />
          <RichButton editor={editor} label="↗" title="Link" action={setLink} />
          <RichButton editor={editor} label="▦" title="Tabela" action={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <RichButton editor={editor} label="⌁" title="Quebra de página" action={() => editor?.chain().focus().insertContent({ type: 'pageBreak' }).run()} />
          <RichButton editor={editor} label="↶" title="Desfazer" action={() => editor?.chain().focus().undo().run()} />
          <RichButton editor={editor} label="↷" title="Refazer" action={() => editor?.chain().focus().redo().run()} />
        </div> : null}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
