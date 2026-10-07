import { docCategorieBadgeStyle } from './hooks'

// Badges des catégories d'une note, dans l'ordre de la liaison (la 1re mène).
// Journal : la nature reste affichée en premier (second signal), puis les interventions.
// Documentation : les apports ; sans catégorie → badge « documentation ».
const NATURE = {
  observation: ['👁', 'Observation'], activite: ['⚡', 'Activité'], mixte: ['🔀', 'Observ.→Activité'],
}

export default function CategorieBadges({ note, max = Infinity }) {
  const cats = note.categories ?? (note.doc_categorie ? [note.doc_categorie] : [])
  const visibles = cats.slice(0, max)
  const reste = cats.length - visibles.length
  const nat = note.type === 'journal' ? NATURE[note.nature] : null
  return (
    <>
      {nat && <span className={`jd-badge jd-badge-${note.nature}`}>{nat[0]} {nat[1]}</span>}
      {!nat && cats.length === 0 && (
        <span className={`jd-badge jd-badge-${note.type}`}>{note.type === 'documentation' ? '📄 documentation' : '📔 journal'}</span>
      )}
      {visibles.map(c => (
        <span key={c.id} className="jd-badge jd-badge--doc-cat" style={docCategorieBadgeStyle(c.couleur)}>
          {c.icon || '🏷️'} {c.nom}
        </span>
      ))}
      {reste > 0 && <span className="jd-badge jd-badge--doc-cat" title={cats.slice(max).map(c => c.nom).join(', ')}>+{reste}</span>}
    </>
  )
}
