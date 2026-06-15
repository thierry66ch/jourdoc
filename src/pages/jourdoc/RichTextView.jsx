/**
 * Rendu en lecture seule du contenu d'une note.
 * Gère deux cas : HTML (Tiptap) et texte brut (notes existantes avant le rich text).
 */
export default function RichTextView({ content, className = '' }) {
  if (!content) return null

  const isHTML = content.trimStart().startsWith('<')

  if (!isHTML) {
    // Texte brut — convertir les sauts de ligne
    return (
      <div className={`rich-view rich-view--plain ${className}`}>
        {content.split('\n').map((line, i) =>
          line ? <p key={i}>{line}</p> : <br key={i} />
        )}
      </div>
    )
  }

  return (
    <div
      className={`rich-view ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
