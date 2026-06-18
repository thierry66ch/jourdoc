import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'

export default function RichTextEditor({
  initialContent, onChange, placeholder,
  // Format du « mode source ». Par défaut HTML (identité).
  // Pour un document Markdown : htmlToSource = html→md, sourceToHtml = md→html.
  htmlToSource = h => h, sourceToHtml = h => h,
}) {
  const [sourceMode, setSourceMode] = useState(false)
  const [sourceText, setSourceText] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  function addLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href ?? ''
    const url = window.prompt('URL du lien :', prev)
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url, target: '_blank' }).run()
  }

  function toggleSource() {
    if (!editor) return
    if (!sourceMode) {
      setSourceText(htmlToSource(editor.getHTML()))
    } else {
      const html = sourceToHtml(sourceText)
      editor.commands.setContent(html, false)
      onChange?.(html)
    }
    setSourceMode(s => !s)
  }

  // Édition dans le mode source : garder le parent synchronisé (converti en HTML)
  function onSourceChange(text) {
    setSourceText(text)
    onChange?.(sourceToHtml(text))
  }

  if (!editor) return null

  return (
    <div className="rte">
      <div className="rte-toolbar">
        {/* Format texte */}
        <button type="button" className={`rte-btn rte-bold${editor.isActive('bold') ? ' active' : ''}`}
          title="Gras (Ctrl+B)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          disabled={sourceMode}>G</button>
        <button type="button" className={`rte-btn rte-italic${editor.isActive('italic') ? ' active' : ''}`}
          title="Italique (Ctrl+I)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
          disabled={sourceMode}>I</button>
        <button type="button" className={`rte-btn rte-underline${editor.isActive('underline') ? ' active' : ''}`}
          title="Souligné (Ctrl+U)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
          disabled={sourceMode}>S</button>
        <button type="button" className={`rte-btn rte-strike${editor.isActive('strike') ? ' active' : ''}`}
          title="Barré" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }}
          disabled={sourceMode} style={{ textDecoration: 'line-through' }}>S</button>

        <span className="rte-sep" />

        {/* Code */}
        <button type="button" className={`rte-btn rte-code${editor.isActive('code') ? ' active' : ''}`}
          title="Code inline" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}
          disabled={sourceMode}>&lt;&gt;</button>
        <button type="button" className={`rte-btn rte-code${editor.isActive('codeBlock') ? ' active' : ''}`}
          title="Bloc de code" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run() }}
          disabled={sourceMode}>{ }</button>

        <span className="rte-sep" />

        {/* Listes */}
        <button type="button" className={`rte-btn${editor.isActive('bulletList') ? ' active' : ''}`}
          title="Puces (Tab pour indenter, Maj+Tab pour désindenter)"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
          disabled={sourceMode}>•</button>
        <button type="button" className={`rte-btn${editor.isActive('orderedList') ? ' active' : ''}`}
          title="Liste numérotée"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }}
          disabled={sourceMode}>1.</button>

        <span className="rte-sep" />

        {/* Titres */}
        <button type="button" className={`rte-btn rte-h1${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`}
          title="Titre (H1)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }}
          disabled={sourceMode}>H1</button>
        <button type="button" className={`rte-btn rte-h2${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`}
          title="Sous-titre (H2)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}
          disabled={sourceMode}>H2</button>

        <span className="rte-sep" />

        {/* Lien */}
        <button type="button" className={`rte-btn${editor.isActive('link') ? ' active' : ''}`}
          title="Lien" onMouseDown={e => { e.preventDefault(); addLink() }}
          disabled={sourceMode}>🔗</button>

        <span className="rte-sep" />

        {/* Source HTML */}
        <button type="button" className={`rte-btn${sourceMode ? ' active' : ''}`}
          title="Voir/éditer le code source HTML"
          onMouseDown={e => { e.preventDefault(); toggleSource() }}>
          &lt;/&gt;
        </button>
      </div>

      {/* Éditeur Tiptap ou textarea source */}
      {sourceMode ? (
        <textarea
          className="rte-source"
          value={sourceText}
          onChange={e => onSourceChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} className="rte-content" data-placeholder={placeholder ?? 'Saisissez le contenu…'} />
      )}
    </div>
  )
}
