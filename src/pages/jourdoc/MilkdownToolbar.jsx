import { callCommand } from '@milkdown/kit/utils'
import { useInstance } from '@milkdown/react'
import {
  toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand,
  wrapInHeadingCommand, wrapInBulletListCommand, wrapInOrderedListCommand,
  wrapInBlockquoteCommand, createCodeBlockCommand, insertHrCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  toggleStrikethroughCommand, insertTableCommand,
  addRowAfterCommand, addColAfterCommand,
} from '@milkdown/kit/preset/gfm'
import {
  toggleHighlightCommand, wrapInCalloutCommand, clearFormattingCommand,
  deleteRowCommand, deleteColumnCommand, deleteTableCommand,
} from './milkdownExtras'

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
  const Btn = (props) => <button type="button" className="rte-btn" {...props} />

  return (
    <div className="rte-toolbar milkdown-toolbar">
      <Btn title="Gras" onMouseDown={run(toggleStrongCommand)}><b>G</b></Btn>
      <Btn title="Italique" onMouseDown={run(toggleEmphasisCommand)}><i>I</i></Btn>
      <Btn title="Barré" style={{ textDecoration: 'line-through' }} onMouseDown={run(toggleStrikethroughCommand)}>S</Btn>
      <Btn title="Surligner" onMouseDown={run(toggleHighlightCommand)}>🖍</Btn>
      <Btn title="Code" onMouseDown={run(toggleInlineCodeCommand)}>&lt;&gt;</Btn>
      <Btn title="Effacer la mise en forme" onMouseDown={run(clearFormattingCommand)}>T<sub>x</sub></Btn>

      <span className="rte-sep" />

      <Btn title="Titre 1" onMouseDown={run(wrapInHeadingCommand, 1)}>H1</Btn>
      <Btn title="Titre 2" onMouseDown={run(wrapInHeadingCommand, 2)}>H2</Btn>
      <Btn title="Titre 3" onMouseDown={run(wrapInHeadingCommand, 3)}>H3</Btn>
      <Btn title="Paragraphe (enlève le titre)" onMouseDown={run(clearFormattingCommand)}>¶</Btn>

      <span className="rte-sep" />

      <Btn title="Liste à puces" onMouseDown={run(wrapInBulletListCommand)}>•</Btn>
      <Btn title="Liste numérotée" onMouseDown={run(wrapInOrderedListCommand)}>1.</Btn>
      <Btn title="Citation" onMouseDown={run(wrapInBlockquoteCommand)}>❝</Btn>
      <Btn title="Bloc de code" onMouseDown={run(createCodeBlockCommand)}>{'{ }'}</Btn>
      <Btn title="Ligne horizontale" onMouseDown={run(insertHrCommand)}>―</Btn>

      <span className="rte-sep" />

      {/* Encadrés (callouts) — 4 variantes */}
      <Btn title="Encadré info" onMouseDown={run(wrapInCalloutCommand, 'info')}>ℹ️</Btn>
      <Btn title="Encadré astuce" onMouseDown={run(wrapInCalloutCommand, 'tip')}>💡</Btn>
      <Btn title="Encadré attention" onMouseDown={run(wrapInCalloutCommand, 'warning')}>⚠️</Btn>
      <Btn title="Encadré succès" onMouseDown={run(wrapInCalloutCommand, 'success')}>✅</Btn>

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
