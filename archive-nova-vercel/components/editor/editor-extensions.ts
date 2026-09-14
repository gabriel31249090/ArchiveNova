import { Extension, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import { TextStyleKit } from '@tiptap/extension-text-style'

export const FONT_OPTIONS = [
  { label: 'Literária', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Clássica', value: '"Times New Roman", Times, serif' },
  { label: 'Moderna', value: 'Inter, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Monoespaçada', value: '"Courier New", Courier, monospace' },
] as const

export const FONT_SIZE_OPTIONS = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px'] as const
export const LINE_HEIGHT_OPTIONS = ['1.2', '1.4', '1.5', '1.65', '1.8', '2'] as const

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [
      { tag: 'div[data-page-break]' },
      { tag: 'hr[data-page-break]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': 'true',
        class: 'an-page-break',
        role: 'separator',
        'aria-label': 'Quebra de página',
      }),
    ]
  },
})

export const ParagraphPresentation = Extension.create({
  name: 'paragraphPresentation',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textIndent: {
            default: null,
            parseHTML: (element) => element.style.textIndent || null,
            renderHTML: (attributes) => attributes.textIndent
              ? { style: `text-indent:${String(attributes.textIndent)}` }
              : {},
          },
        },
      },
    ]
  },
})

export function createArchiveEditorExtensions(placeholder = 'Comece a escrever sua história…') {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    TextStyleKit,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
    }),
    Subscript,
    Superscript,
    TableKit.configure({
      table: {
        resizable: true,
        HTMLAttributes: { class: 'an-story-table' },
      },
    }),
    PageBreak,
    ParagraphPresentation,
    Placeholder.configure({
      placeholder,
      emptyEditorClass: 'is-editor-empty',
    }),
  ]
}
