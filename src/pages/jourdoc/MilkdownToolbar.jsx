import { callCommand } from '@milkdown/kit/utils'
import { useInstance } from '@milkdown/react'
import {
  toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand,
  wrapInHeadingCommand, wrapInBulletListCommand, wrapInOrderedListCommand,
  wrapInBlockquoteCommand, createCodeBlockCommand, insertHrCommand,
} from '@milkdown/kit/preset/commonmark'
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm'
import { toggleHighlightCommand, wrapInCalloutCommand } from './milkdownExtras'

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

  return (
    <div className="rte-toolbar milkdown-toolbar">
      <button type="button" className="rte-btn" title="Gras" onMouseDown={run(toggleStrongCommand)}><b>G</b></button>
      <button type="button" className="rte-btn" title="Italique" onMouseDown={run(toggleEmphasisCommand)}><i>I</i></button>
      <button type="button" className="rte-btn" title="Barré" style={{ textDecoration: 'line-through' }} onMouseDown={run(toggleStrikethroughCommand)}>S</button>
      <button type="button" className="rte-btn" title="Surligner" onMouseDown={run(toggleHighlightCommand)}>🖍</button>
      <button type="button" className="rte-btn" title="Code" onMouseDown={run(toggleInlineCodeCommand)}>&lt;&gt;</button>

      <span className="rte-sep" />

      <button type="button" className="rte-btn" title="Titre 1" onMouseDown={run(wrapInHeadingCommand, 1)}>H1</button>
      <button type="button" className="rte-btn" title="Titre 2" onMouseDown={run(wrapInHeadingCommand, 2)}>H2</button>
      <button type="button" className="rte-btn" title="Titre 3" onMouseDown={run(wrapInHeadingCommand, 3)}>H3</button>

      <span className="rte-sep" />

      <button type="button" className="rte-btn" title="Liste à puces" onMouseDown={run(wrapInBulletListCommand)}>•</button>
      <button type="button" className="rte-btn" title="Liste numérotée" onMouseDown={run(wrapInOrderedListCommand)}>1.</button>
      <button type="button" className="rte-btn" title="Citation" onMouseDown={run(wrapInBlockquoteCommand)}>❝</button>
      <button type="button" className="rte-btn" title="Encadré (astuce)" onMouseDown={run(wrapInCalloutCommand, 'tip')}>💡</button>

      <span className="rte-sep" />

      <button type="button" className="rte-btn" title="Bloc de code" onMouseDown={run(createCodeBlockCommand)}>{'{ }'}</button>
      <button type="button" className="rte-btn" title="Tableau" onMouseDown={run(insertTableCommand)}>▦</button>
      <button type="button" className="rte-btn" title="Ligne horizontale" onMouseDown={run(insertHrCommand)}>―</button>
    </div>
  )
}
