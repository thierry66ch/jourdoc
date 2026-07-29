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

// Champs du schéma COMMUN à toutes les notes (ou null si elles n'en partagent pas un seul).
export function champsSchemaCommun(notes, schemas) {
  const ids = new Set(notes.map(n => n.schema_donnees_id).filter(Boolean))
  if (ids.size !== 1) return null
  const s = schemas.find(x => x.id === [...ids][0])
  return Array.isArray(s?.champs) && s.champs.length ? s.champs : null
}

// Filtre une liste de notes sur la valeur d'un champ (gère le booléen « Non » = vide).
export function filtrerParDonnee(notes, champ, valeur) {
  if (!champ || valeur === '') return notes
  return notes.filter(n => {
    const v = String(n.donnees_etendues?.[champ.cle] ?? '')
    return v === valeur || (champ.type === 'booleen' && valeur === 'false' && !n.donnees_etendues?.[champ.cle])
  })
}
