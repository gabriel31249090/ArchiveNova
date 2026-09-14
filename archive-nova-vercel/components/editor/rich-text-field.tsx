'use client'

import { useEffect, useMemo, type CSSProperties } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'

type TiptapEditor = NonNullable<ReturnType<typeof useEditor>>


function normalizeEditorValue(value: string) {
  if (!value.trim()) return '<p></p>'
  if (/<\/?(?:p|h[1-3]|ul|ol|li|blockquote|strong|em|u|s|hr|br)\b/i.test(value)) return value
  const escaped = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  return escaped.split(/\n{2,}/u).map((block) => `<p>${block.replaceAll('\n', '<br>')}</p>`).join('')
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
  const extensions = useMemo(() => [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder, emptyEditorClass: 'is-editor-empty' }),
  ], [placeholder])

  const editor = useEditor({
    extensions,
    content: normalizeEditorValue(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'manage-rich-content',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: currentEditor }: { editor: TiptapEditor }) => onChange(currentEditor.getHTML()),
  })

  useEffect(() => {
    if (!editor) return
    const next = normalizeEditorValue(value)
    if (editor.getHTML() !== next) editor.commands.setContent(next, { emitUpdate: false })
  }, [editor, value])

  return (
    <div className="manage-rich-editor" style={{ '--manage-editor-min-height': `${minHeight}px` } as CSSProperties}>
      <div className="manage-rich-toolbar" role="toolbar" aria-label="Formatação do capítulo">
        <button type="button" className={editor?.isActive('bold') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" className={editor?.isActive('italic') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" className={editor?.isActive('underline') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button>
        <span />
        <button type="button" className={editor?.isActive('heading', { level: 2 }) ? 'active' : ''} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" className={editor?.isActive('bulletList') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBulletList().run()}>•</button>
        <button type="button" className={editor?.isActive('orderedList') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
        <button type="button" className={editor?.isActive('blockquote') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>❝</button>
        <span />
        <button type="button" onClick={() => editor?.chain().focus().undo().run()} aria-label="Desfazer">↶</button>
        <button type="button" onClick={() => editor?.chain().focus().redo().run()} aria-label="Refazer">↷</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
