import { useState, useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import { SlashCommand } from './slashMenu'
import { buildMention } from './mention'
import { Callout } from './callout'
import { MathInline, MathBlock } from './math'

export default function RichTextEditor({
  initialContent, onChange, placeholder,
  // Format du « mode source ». Par défaut HTML (identité).
  // Pour un document Markdown : htmlToSource = html→md, sourceToHtml = md→html.
  htmlToSource = h => h, sourceToHtml = h => h,
  // Source des mentions « @ » : async (query) => [{ id:'objet:1', label, type, icon }]
  mentionItems = null,
  // Images : upload des images collées/déposées → annexe ; resolveImg réécrit le src
  // stocké (sans token) vers le proxy authentifié à l'affichage ; attachedImages =
  // images déjà jointes, pour le bouton d'insertion.
  onImageUpload = null,
  resolveImg = s => s,
  attachedImages = [],
}) {
  const [sourceMode, setSourceMode] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const [showImgPicker, setShowImgPicker] = useState(false)
  const [uploadingImgs, setUploadingImgs] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const rootRef = useRef(null)
  const mentionRef = useRef(null)
  mentionRef.current = mentionItems

  // Plein écran : overlay fixe dont la hauteur suit le viewport visible (au-dessus du
  // clavier Android). Évite le double-scroll et garde la toolbar visible.
  useEffect(() => {
    const root = rootRef.current
    if (!fullscreen || !root) return
    document.body.style.overflow = 'hidden'
    const vv = window.visualViewport
    const apply = () => {
      if (!vv) return
      root.style.height = `${vv.height}px`
      root.style.transform = `translateY(${vv.offsetTop}px)`
    }
    apply()
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('keydown', onKey)
      root.style.height = ''
      root.style.transform = ''
    }
  }, [fullscreen])

  // Vue normale mobile : plafonne la hauteur de l'éditeur à ~la moitié de la zone
  // VISIBLE (visualViewport, qui rétrécit avec le clavier) → on voit toujours le
  // contenu au-dessus/en dessous, la page reste scrollable. (En plein écran, une règle
  // CSS plus spécifique reprend la main.)
  useEffect(() => {
    const root = rootRef.current
    const vv = window.visualViewport
    if (!root || !vv) return
    const apply = () => root.style.setProperty('--rte-maxh', `${Math.round(vv.height * 0.5)}px`)
    apply()
    vv.addEventListener('resize', apply)
    return () => vv.removeEventListener('resize', apply)
  }, [])

  // Indenter / désindenter l'élément de liste courant (taskList ou liste classique).
  // Utile sur mobile (pas de touche Tab).
  function indentList() {
    if (!editor) return
    if (editor.can().sinkListItem('taskItem')) editor.chain().focus().sinkListItem('taskItem').run()
    else editor.chain().focus().sinkListItem('listItem').run()
  }
  function outdentList() {
    if (!editor) return
    if (editor.can().liftListItem('taskItem')) editor.chain().focus().liftListItem('taskItem').run()
    else editor.chain().focus().liftListItem('listItem').run()
  }

  // Image média : src stocké inchangé (sans token) ; affichage via le proxy authentifié
  // grâce à resolveImg (nodeView). Les images base64 (anciennes notes) passent telles quelles.
  const MediaImage = Image.extend({
    addNodeView() {
      return ({ node, HTMLAttributes }) => {
        const dom = document.createElement('img')
        for (const [k, v] of Object.entries(HTMLAttributes)) {
          if (k !== 'src' && v != null) dom.setAttribute(k, v)
        }
        dom.setAttribute('src', resolveImg(node.attrs.src || ''))
        return { dom }
      }
    },
  }).configure({ inline: false, allowBase64: true })

  // Upload des images collées/déposées → insertion avec le src stocké renvoyé par le parent.
  // Indicateur d'activité pendant le traitement serveur (resize/conversion ~3-4 s).
  async function uploadAndInsert(files) {
    if (!editor || !onImageUpload) return
    setUploadingImgs(n => n + files.length)
    for (const file of files) {
      try {
        const { src } = await onImageUpload(file)
        if (src) editor.chain().focus().setImage({ src }).run()
      } catch { /* upload échoué : on ignore */ }
      finally { setUploadingImgs(n => Math.max(0, n - 1)) }
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MediaImage,
      Highlight,
      MathInline,
      MathBlock,
      Callout,
      SlashCommand,
      buildMention(() => mentionRef.current),
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      handlePaste(view, event) {
        if (!onImageUpload) return false
        const files = Array.from(event.clipboardData?.files || []).filter(f => f.type?.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault(); uploadAndInsert(files); return true
      },
      handleDrop(view, event) {
        if (!onImageUpload) return false
        const files = Array.from(event.dataTransfer?.files || []).filter(f => f.type?.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault(); uploadAndInsert(files); return true
      },
    },
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
    <div className={`rte${fullscreen ? ' rte--fullscreen' : ''}`} ref={rootRef}>
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
        <button type="button" className={`rte-btn rte-highlight rte-btn--adv${editor.isActive('highlight') ? ' active' : ''}`}
          title="Surligner" onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHighlight().run() }}
          disabled={sourceMode}>🖍</button>

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
        <button type="button" className="rte-btn"
          title="Désindenter la liste (Maj+Tab)"
          onMouseDown={e => { e.preventDefault(); outdentList() }}
          disabled={sourceMode}>⇤</button>
        <button type="button" className="rte-btn"
          title="Indenter la liste (Tab)"
          onMouseDown={e => { e.preventDefault(); indentList() }}
          disabled={sourceMode}>⇥</button>

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

        {/* Insérer une image déjà jointe à la note */}
        {attachedImages.length > 0 && (
          <button type="button" className={`rte-btn${showImgPicker ? ' active' : ''}`}
            title="Insérer une image jointe"
            onMouseDown={e => { e.preventDefault(); setShowImgPicker(v => !v) }}
            disabled={sourceMode}>🖼</button>
        )}

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

        {/* Plein écran (confort de saisie mobile : toolbar fixe, pas de double-scroll) */}
        <button type="button" className={`rte-btn${fullscreen ? ' active' : ''}`}
          title={fullscreen ? 'Quitter le plein écran (Échap)' : 'Plein écran'}
          onMouseDown={e => { e.preventDefault(); setFullscreen(f => !f) }}>
          {fullscreen ? '✕' : '⛶'}
        </button>
      </div>

      {/* Indicateur d'upload d'image en cours */}
      {uploadingImgs > 0 && (
        <div className="rte-uploading">
          <span className="rte-uploading__dot" />
          Envoi de l'image{uploadingImgs > 1 ? `s (${uploadingImgs})` : ''}… traitement en cours
        </div>
      )}

      {/* Sélecteur d'images jointes */}
      {showImgPicker && !sourceMode && attachedImages.length > 0 && (
        <div className="rte-img-picker">
          {attachedImages.map((img, i) => (
            <img key={i} className="rte-img-picker__thumb" src={resolveImg(img.src)} alt={img.alt || ''}
              title={img.alt || ''}
              onMouseDown={e => { e.preventDefault(); editor.chain().focus().setImage({ src: img.src }).run(); setShowImgPicker(false) }} />
          ))}
        </div>
      )}

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
