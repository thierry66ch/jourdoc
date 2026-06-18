import { useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { SlashCommand } from './slashMenu'
import { buildMention } from './mention'
import { Callout } from './callout'

export default function RichTextEditor({
  initialContent, onChange, placeholder,
  // Format du « mode source ». Par défaut HTML (identité).
  // Pour un document Markdown : htmlToSource = html→md, sourceToHtml = md→html.
  htmlToSource = h => h, sourceToHtml = h => h,
  // Source des mentions « @ » : async (query) => [{ id:'objet:1', label, type, icon }]
  mentionItems = null,
}) {
  const [sourceMode, setSourceMode] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const mentionRef = useRef(null)
  mentionRef.current = mentionItems

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Callout,
      SlashCommand,
      buildMention(() => mentionRef.current),
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
        <button type="button" className={`rte-btn rte-strike rte-btn--adv${editor.isActive('strike') ? ' active' : ''}`}
          title="Barré" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }}
          disabled={sourceMode} style={{ textDecoration: 'line-through' }}>S</button>

        <span className="rte-sep rte-sep--adv" />

        {/* Code */}
        <button type="button" className={`rte-btn rte-code rte-btn--adv${editor.isActive('code') ? ' active' : ''}`}
          title="Code inline" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}
          disabled={sourceMode}>&lt;&gt;</button>
        <button type="button" className={`rte-btn rte-code rte-btn--adv${editor.isActive('codeBlock') ? ' active' : ''}`}
          title="Bloc de code" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run() }}
          disabled={sourceMode}>{'{ }'}</button>

        <span className="rte-sep rte-sep--adv" />

        {/* Listes */}
        <button type="button" className={`rte-btn${editor.isActive('bulletList') ? ' active' : ''}`}
          title="Puces (Tab pour indenter, Maj+Tab pour désindenter)"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
          disabled={sourceMode}>•</button>
        <button type="button" className={`rte-btn${editor.isActive('orderedList') ? ' active' : ''}`}
          title="Liste numérotée"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }}
          disabled={sourceMode}>1.</button>
        <button type="button" className={`rte-btn rte-btn--adv${editor.isActive('taskList') ? ' active' : ''}`}
          title="Case à cocher"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleTaskList().run() }}
          disabled={sourceMode}>☑</button>

        <span className="rte-sep" />

        {/* Titres */}
        <button type="button" className={`rte-btn rte-h1${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`}
          title="Titre (H1)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }}
          disabled={sourceMode}>H1</button>
        <button type="button" className={`rte-btn rte-h2${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`}
          title="Sous-titre (H2)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}
          disabled={sourceMode}>H2</button>
        <button type="button" className={`rte-btn rte-h2 rte-btn--adv${editor.isActive('heading', { level: 3 }) ? ' active' : ''}`}
          title="Sous-sous-titre (H3)" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run() }}
          disabled={sourceMode}>H3</button>

        <span className="rte-sep rte-sep--adv" />

        {/* Tableau */}
        <button type="button" className={`rte-btn rte-btn--adv${editor.isActive('table') ? ' active' : ''}`}
          title="Insérer un tableau"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }}
          disabled={sourceMode}>▦</button>
        {editor.isActive('table') && !sourceMode && (
          <>
            <button type="button" className="rte-btn" title="Ajouter une colonne"
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run() }}>+┃</button>
            <button type="button" className="rte-btn" title="Ajouter une ligne"
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run() }}>+━</button>
            <button type="button" className="rte-btn" title="Supprimer la colonne"
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run() }}>−┃</button>
            <button type="button" className="rte-btn" title="Supprimer la ligne"
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run() }}>−━</button>
            <button type="button" className="rte-btn rte-btn--danger" title="Supprimer le tableau"
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run() }}>✕▦</button>
          </>
        )}

        <span className="rte-sep" />

        {/* Lien */}
        <button type="button" className={`rte-btn${editor.isActive('link') ? ' active' : ''}`}
          title="Lien" onMouseDown={e => { e.preventDefault(); addLink() }}
          disabled={sourceMode}>🔗</button>

        {/* Menu « / » — insertion (titres, listes, tableau, cases…) */}
        <button type="button" className="rte-btn rte-btn--slash"
          title="Insérer (titres, listes, tableau, cases à cocher…)"
          onMouseDown={e => {
            e.preventDefault()
            // Réduire la sélection avant d'insérer « / » (sinon le texte sélectionné est remplacé)
            editor.chain().focus().setTextSelection(editor.state.selection.to).insertContent('/').run()
          }}
          disabled={sourceMode}>＋</button>

        <span className="rte-sep" />

        {/* Source HTML */}
        <button type="button" className={`rte-btn${sourceMode ? ' active' : ''}`}
          title="Voir/éditer le code source"
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
