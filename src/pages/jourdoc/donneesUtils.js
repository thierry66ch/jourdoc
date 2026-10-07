// Helpers partagés pour l'exploitation des données étendues côté client (Biblio + Calendrier).

// Types de données étendues à valeurs discrètes → exploitables en groupement/filtre.
export const GROUPABLES = new Set(['select', 'echelle', 'booleen'])

// Valeurs possibles d'un champ, sous forme [valeurStockée, libellé], dans l'ordre naturel.
export function valeursDe(champ) {
  if (!champ) return []
  if (champ.type === 'booleen') return [['true', 'Oui'], ['false', 'Non']]
  if (champ.type === 'select') return (champ.options ?? []).map(o => [o, o])
  if (champ.type === 'echelle') {
    const min = Number(champ.min ?? 1), max = Number(champ.max ?? 5)
    return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => [String(min + i), `${min + i}/${max}`])
  }
  return []
}

// Libellé de la valeur d'une note pour ce champ, ou null si non renseigné.
// (Un booléen non coché = « Non » ; les autres types vides = non renseigné.)
export function libelleValeur(champ, raw) {
  if (champ.type === 'booleen') return raw === 'true' ? 'Oui' : 'Non'
  if (raw === '' || raw == null) return null
  if (champ.type === 'echelle') return `${raw}/${champ.max ?? 5}`
  return String(raw)
}

// Sous-groupe une liste de notes par la valeur d'un champ, dans l'ordre naturel,
// « non renseigné » en dernier. Renvoie [{ label, items }].
export function sousGroupes(items, champ) {
  const buckets = new Map()
  for (const n of items) {
    const label = libelleValeur(champ, String(n.donnees_etendues?.[champ.cle] ?? '')) ?? '— non renseigné —'
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label).push(n)
  }
  const out = [], vus = new Set()
  for (const [, l] of valeursDe(champ)) if (buckets.has(l)) { out.push({ label: l, items: buckets.get(l) }); vus.add(l) }
  for (const [l, its] of buckets) if (!vus.has(l)) out.push({ label: l, items: its })
  return out
}

// Champs des schémas COMMUNS à toutes les notes : même ensemble de schémas appliqués
// (cache schema_donnees_ids, fusion multi-catégories) → union des champs dédupliqués par clé,
// dans l'ordre des schémas. null si les notes n'appliquent pas toutes les mêmes schémas.
export function champsSchemaCommun(notes, schemas) {
  const cle = n => (n.schema_donnees_ids ?? (n.schema_donnees_id ? [n.schema_donnees_id] : [])).join(',')
  const sigs = new Set(notes.map(cle))
  if (sigs.size !== 1) return null
  const ids = [...sigs][0].split(',').filter(Boolean).map(Number)
  const champs = []
  for (const id of ids)
    for (const ch of (schemas.find(x => x.id === id)?.champs ?? []))
      if (ch?.cle && !champs.some(c => c.cle === ch.cle)) champs.push(ch)
  return champs.length ? champs : null
}

// Filtre une liste de notes sur la valeur d'un champ (gère le booléen « Non » = vide).
export function filtrerParDonnee(notes, champ, valeur) {
  if (!champ || valeur === '') return notes
  return notes.filter(n => {
    const v = String(n.donnees_etendues?.[champ.cle] ?? '')
    return v === valeur || (champ.type === 'booleen' && valeur === 'false' && !n.donnees_etendues?.[champ.cle])
  })
}
