// Formulaire dynamique des données étendues (Phase B).
//
// Rend les champs décrits par le schéma résolu, plus une section « hors schéma » pour les
// valeurs déjà saisies dont la clé n'appartient pas (ou plus) au schéma courant : on ne
// perd JAMAIS une donnée saisie, même si le contexte de la note change.
//
// Source de vérité = tableau ordonné [{cle, valeur}] (l'ordre de saisie compte pour les
// valeurs libres ; les champs du schéma, eux, suivent l'ordre du schéma).

const TYPES_NUM = new Set(['nombre', 'decimal'])

export default function DonneesEtenduesForm({ schema, donnees, setDonnees }) {
  const champs = Array.isArray(schema?.champs) ? schema.champs : []
  const clesSchema = new Set(champs.map(c => c.cle))
  const horsSchema = donnees.filter(d => d.cle && !clesSchema.has(d.cle))

  const getVal = cle => donnees.find(d => d.cle === cle)?.valeur ?? ''
  const setVal = (cle, valeur) => setDonnees(list =>
    list.some(d => d.cle === cle)
      ? list.map(d => (d.cle === cle ? { ...d, valeur } : d))
      : [...list, { cle, valeur }]
  )

  function renderChamp(champ) {
    const v = getVal(champ.cle)
    const onI = e => setVal(champ.cle, e.target.value)

    switch (champ.type) {
      case 'texte_long':
        return <textarea className="input" rows={3} value={v} onChange={onI} />

      case 'nombre':
      case 'decimal':
        return (
          <div className="jd-de-champ__inline">
            <input className="input" type="number" value={v} onChange={onI}
              step={champ.type === 'decimal' ? '0.01' : '1'} />
            {champ.unite && <span className="jd-de-champ__unite">{champ.unite}</span>}
          </div>
        )

      case 'echelle': {
        const min = Number(champ.min ?? 1), max = Number(champ.max ?? 5)
        const cur = Number(v)
        const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i)
        return (
          <div className="jd-de-echelle">
            {vals.map(n => (
              <button key={n} type="button"
                className={`jd-de-echelle__star${cur >= n ? ' on' : ''}`}
                title={`${n}/${max}`}
                onClick={() => setVal(champ.cle, cur === n ? '' : String(n))}>★</button>
            ))}
            {v !== '' && <span className="jd-de-echelle__val">{cur}/{max}</span>}
          </div>
        )
      }

      case 'select':
        return (
          <select className="input" value={v} onChange={onI}>
            <option value="">—</option>
            {(champ.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )

      case 'booleen':
        return (
          <label className="jd-de-bool">
            <input type="checkbox" checked={v === 'true'}
              onChange={e => setVal(champ.cle, e.target.checked ? 'true' : '')} />
            <span>{v === 'true' ? 'Oui' : 'Non'}</span>
          </label>
        )

      case 'date':
        return <input className="input" type="date" value={v} onChange={onI} />

      case 'texte_court':
      default:
        return <input className="input" type="text" value={v} onChange={onI} />
    }
  }

  return (
    <>
      {champs.length > 0 && (
        <div className="jd-de-form">
          {champs.map(champ => (
            <div key={champ.cle} className="jd-de-champ">
              <label className="jd-de-champ__label">
                {champ.label || champ.cle}
                {champ.unite && !TYPES_NUM.has(champ.type) ? ` (${champ.unite})` : ''}
              </label>
              <div className="jd-de-champ__input">{renderChamp(champ)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Valeurs ne relevant pas du schéma courant — conservées et éditables */}
      {horsSchema.length > 0 && (
        <div className="jd-de-hors">
          <div className="jd-de-hors__titre">
            Hors schéma ({horsSchema.length})
            <span className="jd-de-hors__aide">valeurs saisies dans un autre contexte — conservées</span>
          </div>
          {horsSchema.map(d => (
            <div key={d.cle} className="jd-donnees-edit__row">
              <input className="input" value={d.cle} readOnly />
              <input className="input" value={d.valeur}
                onChange={e => setVal(d.cle, e.target.value)} />
              <button type="button" className="jd-donnees-edit__remove" title="Supprimer cette donnée"
                onClick={() => setDonnees(list => list.filter(x => x.cle !== d.cle))}>×</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
