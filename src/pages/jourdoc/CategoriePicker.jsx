import { categorieApplicable, categoriesPourContexte, docCategorieBadgeStyle, libelleCategories } from './hooks'

/**
 * Sélecteur multiple et ORDONNÉ de catégories (spec MIGRATION-categories §6.1).
 *
 * - Libellé contextuel : « Apports » (documentation) / « Interventions » (journal).
 * - Propositions filtrées par le contexte (portée × type × nature).
 * - La 1re catégorie mène le titre et donne la couleur de pastille : ★ pour la mettre en tête.
 * - Une catégorie déjà choisie mais hors contexte (type/nature changés) reste affichée,
 *   signalée, pour que l'utilisateur décide (rien n'est retiré en silence).
 *
 * Props : categories (référentiel complet), value (ids ordonnés), onChange(ids), type, nature, onManage
 */
export default function CategoriePicker({ categories, value, onChange, type, nature, onManage }) {
  const byId = new Map(categories.map(c => [c.id, c]))
  const choisies = value.map(id => byId.get(id)).filter(Boolean)
  const proposees = categoriesPourContexte(categories, type, nature).filter(c => !value.includes(c.id))

  const retirer = id => onChange(value.filter(x => x !== id))
  const enTete = id => onChange([id, ...value.filter(x => x !== id)])
  const ajouter = id => onChange([...value, id])

  return (
    <div className="form-field jd-cat-picker">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label className="form-label">{libelleCategories(type)}</label>
        {onManage && <button type="button" className="jd-auto-btn" onClick={onManage}>⚙️ Gérer</button>}
      </div>

      {choisies.length > 0 && (
        <div className="jd-cat-picker__choisies">
          {choisies.map((c, i) => {
            const hors = !categorieApplicable(c, type, nature)
            return (
              <span key={c.id} className={`jd-cat-chip${i === 0 ? ' jd-cat-chip--tete' : ''}${hors ? ' jd-cat-chip--hors' : ''}`}
                style={docCategorieBadgeStyle(c.couleur)}
                title={hors ? 'Hors contexte : cette catégorie ne s’applique pas à ce type / cette nature de note'
                  : i === 0 ? 'En tête : mène le titre et donne la couleur' : undefined}>
                {i > 0 && (
                  <button type="button" className="jd-cat-chip__btn" onClick={() => enTete(c.id)}
                    title="Mettre en tête (mène le titre, donne la couleur)">★</button>
                )}
                <span>{c.icon || '🏷️'} {c.nom}{hors && ' ⚠️'}</span>
                <button type="button" className="jd-cat-chip__btn" onClick={() => retirer(c.id)} title="Retirer">×</button>
              </span>
            )
          })}
        </div>
      )}

      {proposees.length > 0 ? (
        <div className="jd-cat-picker__options">
          {proposees.map(c => (
            <button key={c.id} type="button" className="jd-cat-option" onClick={() => ajouter(c.id)}
              style={{ borderColor: c.couleur || undefined }}>
              + {c.icon || '🏷️'} {c.nom}
            </button>
          ))}
        </div>
      ) : choisies.length === 0 && (
        <p className="jd-cat-picker__vide">
          Aucune catégorie ne s’applique à ce contexte{onManage ? ' — « Gérer » pour en créer.' : '.'}
        </p>
      )}
    </div>
  )
}
