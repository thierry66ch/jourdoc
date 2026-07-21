import { callCommand, insert } from '@milkdown/kit/utils'
import { useInstance } from '@milkdown/react'
import {
  toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand,
  wrapInHeadingCommand, wrapInBlockquoteCommand, createCodeBlockCommand, insertHrCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  toggleStrikethroughCommand, insertTableCommand,
  addRowAfterCommand, addColAfterCommand,
} from '@milkdown/kit/preset/gfm'
import {
  toggleHighlightCommand, setHighlightColorCommand, wrapInCalloutCommand, clearFormattingCommand,
  toggleBulletListCommand, toggleOrderedListCommand, toggleTaskCommand, flattenListCommand,
  insertBlankLineCommand, deleteRowCommand, deleteColumnCommand, deleteTableCommand, HL_COLORS,
} from './milkdownExtras'

const HL_HEX = { yellow: '#fef08a', pink: '#fbcfe8', green: '#bbf7d0', blue: '#bfdbfe', orange: '#fed7aa' }

// Barre d'outils de l'éditeur Milkdown — dispatch des commandes via callCommand.
// Doit être rendue à l'intérieur du <MilkdownProvider> (useInstance).
export default function MilkdownToolbar() {
  const [loading, getEditor] = useInstance()
  const run = (cmd, payload) => e => {
    e.preventDefault() // garder la sélection/focus de l'éditeur
    if (loading) return
    const ed = getEditor()
    if (ed) ed.action(callCommand(cmd.key, payload))
  }
  // Effacer la mise en forme : aplatir la/les liste(s) en paragraphes (sous-listes
  // incluses) puis retirer les marks + repasser en paragraphe.
  const clearAll = e => {
    e.preventDefault()
    if (loading) return
    const ed = getEditor()
    if (!ed) return
    for (let i = 0; i < 5; i++) {
      if (!ed.action(callCommand(flattenListCommand.key))) break
    }
    ed.action(callCommand(clearFormattingCommand.key))
  }
  // Coller du Markdown de façon fiable (surtout mobile, où l'événement `paste` ne
  // transmet pas toujours le presse-papiers) : lecture explicite via l'API Clipboard,
  // puis insertion INTERPRÉTÉE (insert parse le markdown en nœuds Milkdown).
  const pasteMarkdown = async e => {
    e.preventDefault()
    if (loading) return
    const ed = getEditor()
    if (!ed) return
    try {
      const text = await navigator.clipboard.readText()
      if (text) ed.action(insert(text))
    } catch (err) {
      alert(`Lecture du presse-papiers impossible : ${err.message}`)
    }
  }
  const Btn = (props) => <button type="button" className="rte-btn" {...props} />

  return (
    <div className="rte-toolbar milkdown-toolbar">
      <Btn title="Gras" onMouseDown={run(toggleStrongCommand)}><b>G</b></Btn>
      <Btn title="Italique" onMouseDown={run(toggleEmphasisCommand)}><i>I</i></Btn>
      <Btn title="Barré" style={{ textDecoration: 'line-through' }} onMouseDown={run(toggleStrikethroughCommand)}>S</Btn>
      <Btn title="Surligner (jaune) / retirer" onMouseDown={run(toggleHighlightCommand)}>🖍</Btn>
      {HL_COLORS.map(c => (
        <button key={c} type="button" className="rte-btn rte-btn--swatch" title={`Surligner ${c}`}
          onMouseDown={run(setHighlightColorCommand, c)}>
          <span className="hl-swatch" style={{ background: HL_HEX[c] }} />
        </button>
      ))}
      <Btn title="Code" onMouseDown={run(toggleInlineCodeCommand)}>&lt;&gt;</Btn>
      <Btn title="Effacer la mise en forme (et sortir des listes)" onMouseDown={clearAll}>T<sub>x</sub></Btn>

      <span className="rte-sep" />

      <Btn title="Titre 1" onMouseDown={run(wrapInHeadingCommand, 1)}>H1</Btn>
      <Btn title="Titre 2" onMouseDown={run(wrapInHeadingCommand, 2)}>H2</Btn>
      <Btn title="Titre 3" onMouseDown={run(wrapInHeadingCommand, 3)}>H3</Btn>
      <Btn title="Paragraphe (enlève titre / liste)" onMouseDown={clearAll}>¶</Btn>

      <span className="rte-sep" />

      <Btn title="Liste à puces (bascule)" onMouseDown={run(toggleBulletListCommand)}>•</Btn>
      <Btn title="Liste numérotée (bascule)" onMouseDown={run(toggleOrderedListCommand)}>1.</Btn>
      <Btn title="Liste à cocher" onMouseDown={run(toggleTaskCommand)}>☑</Btn>
      <Btn title="Citation" onMouseDown={run(wrapInBlockquoteCommand)}>❝</Btn>
      <Btn title="Bloc de code" onMouseDown={run(createCodeBlockCommand)}>{'{ }'}</Btn>
      <Btn title="Ligne horizontale" onMouseDown={run(insertHrCommand)}>―</Btn>
      <Btn title="Insérer une ligne vide (espacement)" onMouseDown={run(insertBlankLineCommand)}>⏎</Btn>
      <Btn title="Coller du Markdown (interprété)" onMouseDown={pasteMarkdown}>📋<sub>md</sub></Btn>

      <span className="rte-sep" />

      {/* Encadrés (callouts) — 5 standards GitHub */}
      <Btn title="Note" onMouseDown={run(wrapInCalloutCommand, 'note')}>ℹ️</Btn>
      <Btn title="Tip (astuce)" onMouseDown={run(wrapInCalloutCommand, 'tip')}>💡</Btn>
      <Btn title="Important" onMouseDown={run(wrapInCalloutCommand, 'important')}>💬</Btn>
      <Btn title="Warning (attention)" onMouseDown={run(wrapInCalloutCommand, 'warning')}>⚠️</Btn>
      <Btn title="Caution (danger)" onMouseDown={run(wrapInCalloutCommand, 'caution')}>🛑</Btn>

      <span className="rte-sep" />

      {/* Tableau : insertion + édition (agit dans un tableau) */}
      <Btn title="Insérer un tableau" onMouseDown={run(insertTableCommand)}>▦</Btn>
      <Btn title="Ajouter une ligne" onMouseDown={run(addRowAfterCommand)}>＋▭</Btn>
      <Btn title="Supprimer la ligne" onMouseDown={run(deleteRowCommand)}>－▭</Btn>
      <Btn title="Ajouter une colonne" onMouseDown={run(addColAfterCommand)}>＋▯</Btn>
      <Btn title="Supprimer la colonne" onMouseDown={run(deleteColumnCommand)}>－▯</Btn>
      <Btn title="Supprimer le tableau" onMouseDown={run(deleteTableCommand)}>✕▦</Btn>
    </div>
  )
}
