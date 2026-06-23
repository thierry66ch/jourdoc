import { callCommand } from '@milkdown/kit/utils'
import { editorViewCtx } from '@milkdown/kit/core'
import { liftListItem } from '@milkdown/kit/prose/schema-list'
import { TextSelection } from '@milkdown/kit/prose/state'
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
  toggleBulletListCommand, toggleOrderedListCommand, toggleTaskCommand,
  deleteRowCommand, deleteColumnCommand, deleteTableCommand, HL_COLORS,
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
  // Effacer la mise en forme : sortir des listes (tous niveaux, sous-listes incluses)
  // puis marks + paragraphe.
  const clearAll = e => {
    e.preventDefault()
    if (loading) return
    const ed = getEditor()
    if (!ed) return
    // 1. étendre la sélection à la liste la plus externe (pour englober les sous-listes)
    ed.action(ctx => {
      const v = ctx.get(editorViewCtx)
      const { state } = v
      const $f = state.selection.$from
      let depth = -1
      for (let d = $f.depth; d > 0; d--) {
        const t = $f.node(d).type.name
        if (t === 'bullet_list' || t === 'ordered_list') depth = d
      }
      if (depth > 0) {
        const start = $f.before(depth) + 1
        const end = Math.min($f.after(depth) - 1, state.doc.content.size)
        v.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)))
      }
    })
    // 2. délister à fond
    for (let i = 0; i < 30; i++) {
      const lifted = ed.action(ctx => {
        const v = ctx.get(editorViewCtx)
        return liftListItem(v.state.schema.nodes.list_item)(v.state, v.dispatch)
      })
      if (!lifted) break
    }
    // 3. marks + paragraphe
    ed.action(callCommand(clearFormattingCommand.key))
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
