import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { tags } from '@lezer/highlight'
import styles from './DescriptionEditor.module.css'

// Heading sizes equal the sizes of the rendered description, so that the text
// keeps its place when the user moves between the editor and the saved view.
const heading = { fontWeight: '600', color: 'var(--text)' }
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, ...heading, fontSize: '2em' },
  { tag: tags.heading2, ...heading, fontSize: '1.5em' },
  { tag: tags.heading3, ...heading, fontSize: '1.25em' },
  { tag: tags.heading4, ...heading, fontSize: '1em' },
  { tag: tags.heading5, ...heading, fontSize: '0.875em' },
  { tag: tags.heading6, ...heading, fontSize: '0.85em', color: 'var(--text-muted)' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  { tag: tags.link, color: 'var(--accent-text)' },
  { tag: tags.url, color: 'var(--accent-text)', textDecoration: 'underline' },
  { tag: tags.quote, color: 'var(--text-muted)' },
  { tag: tags.comment, color: 'var(--text-subtle)', fontStyle: 'italic' },
  // The syntax marks (#, *, `, >, -) stay visible and are dimmed.
  { tag: tags.processingInstruction, color: 'var(--text-subtle)', fontWeight: '400' },
])

interface Props {
  value: string
  /** The editor starts at this height, in pixels, and grows with its content. */
  minHeight: number
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

/** A markdown source editor that styles the text by its syntax and keeps the syntax visible. */
export default function DescriptionEditor({
  value,
  minHeight,
  onChange,
  onSave,
  onCancel,
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const handlers = useRef({ onChange, onSave, onCancel })
  handlers.current = { onChange, onSave, onCancel }
  const initial = useRef({ value, minHeight })

  useEffect(() => {
    const run = (name: 'onSave' | 'onCancel') => (): boolean => {
      handlers.current[name]()
      return true
    }
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          keymap.of([
            { key: 'Escape', run: run('onCancel') },
            { key: 'Mod-Enter', run: run('onSave') },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          history(),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(markdownStyle),
          EditorView.lineWrapping,
          placeholder('Add a description…'),
          EditorView.contentAttributes.of({ 'aria-label': 'Description' }),
          EditorView.theme({
            '.cm-content': { minHeight: `${initial.current.minHeight}px` },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.focus()
    return () => view.destroy()
  }, [])

  return <div ref={hostRef} className={styles.editor} />
}
