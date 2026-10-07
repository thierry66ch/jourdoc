// Catégories unifiées (migration 014) + résolution / fusion des schémas de données étendues.
//
// Partagé par les routes (jourdoc.js, clipper.js) et les scripts de migration (db/).
// Spec : docs/chantiers/categories/MIGRATION-categories.md §5.

import sql from '../../db/db.js'

const NATURES = ['observation', 'activite', 'mixte']

// ── Catégories ───────────────────────────────────────────────

// Colonnes exposées au client.
export const CAT_COLS = `id, nom, nom_court, icon, couleur, ordre, actif, parent_id,
  applique_observation, applique_activite, applique_documentation, nature_defaut`

// Catégories de plusieurs notes, dans l'ordre de la liaison : Map noteId → [cat…].
export async function categoriesOfNotes(noteIds) {
  const map = new Map(noteIds.map(id => [id, []]))
  if (!noteIds.length) return map
  const rows = await sql`
    SELECT nc.note_id, nc.ordre, c.id, c.nom, c.nom_court, c.icon, c.couleur
    FROM jd_note_categorie nc JOIN jd_categorie c ON c.id = nc.categorie_id
    WHERE nc.note_id = ANY(${noteIds})
    ORDER BY nc.note_id, nc.ordre, c.nom`
  for (const r of rows) {
    const { note_id, ordre, ...cat } = r
    map.get(note_id)?.push(cat)
  }
  return map
}

// Remplace les catégories d'une note (ordre = position dans le tableau). Ne garde que les
// catégories du workspace ; ignore les doublons.
export async function setNoteCategories(wsId, noteId, categorieIds) {
  const ids = [...new Set((categorieIds ?? []).map(Number).filter(n => Number.isInteger(n) && n > 0))]
  await sql`DELETE FROM jd_note_categorie WHERE note_id = ${noteId}`
  if (!ids.length) return
  const valid = new Set((await sql`
    SELECT id FROM jd_categorie WHERE workspace_id = ${wsId} AND id = ANY(${ids})`).map(r => r.id))
  let ordre = 0
  for (const id of ids) {
    if (!valid.has(id)) continue
    await sql`INSERT INTO jd_note_categorie (note_id, categorie_id, ordre)
              VALUES (${noteId}, ${id}, ${ordre++}) ON CONFLICT DO NOTHING`
  }
}

// Catégories demandées par un corps de requête : `categorie_ids` (source de vérité), sinon
// l'ancien `doc_categorie_id` (clients non mis à jour : clipper en cache, PWA ancienne)
// traduit via origine_doc_categorie_id — ou pris tel quel s'il désigne déjà une jd_categorie.
// Renvoie undefined si le corps ne dit rien (→ ne pas toucher à l'existant).
export async function categorieIdsFromBody(wsId, body) {
  if (Array.isArray(body.categorie_ids)) return body.categorie_ids
  if (body.doc_categorie_id === undefined) return undefined
  if (body.doc_categorie_id == null) return []
  const id = Number(body.doc_categorie_id)
  const [c] = await sql`
    SELECT id FROM jd_categorie WHERE workspace_id = ${wsId}
      AND (origine_doc_categorie_id = ${id} OR id = ${id})
    ORDER BY (origine_doc_categorie_id = ${id}) DESC LIMIT 1`
  return c ? [c.id] : []
}

// Catégories par défaut d'un nouveau workspace (portée documentation : « Apports »).
export async function seedCategories(wsId) {
  await sql`INSERT INTO jd_categorie (workspace_id, nom, icon, couleur, ordre,
      applique_observation, applique_activite, applique_documentation)
    SELECT ${wsId}, d.nom, d.icon, d.couleur, d.ordre, FALSE, FALSE, TRUE FROM (VALUES
      ('Conseil','💡','#f59e0b',1),('Descriptif','📋','#0ea5e9',2),
      ('Manuel','📖','#8b5cf6',3),('Norme','📐','#ef4444',4),('Exemple','✨','#10b981',5)
    ) AS d(nom,icon,couleur,ordre) ON CONFLICT (workspace_id, nom) DO NOTHING`
}

// Normalise et valide la portée / nature par défaut reçues du client.
// Renvoie { value } ou { error }.
export function normalizeCategorie(body) {
  const bool = (v, def = true) => v === undefined ? def : (v === true || v === 'true' || v === 1 || v === '1')
  const out = {
    nom: (body.nom ?? '').trim(),
    nom_court: (body.nom_court ?? '').trim() || null,
    icon: body.icon || null,
    couleur: body.couleur || null,
    applique_observation: bool(body.applique_observation),
    applique_activite: bool(body.applique_activite),
    applique_documentation: bool(body.applique_documentation),
    nature_defaut: body.nature_defaut || null,
    actif: bool(body.actif),
  }
  if (!out.nom) return { error: 'Nom requis' }
  if (!out.applique_observation && !out.applique_activite && !out.applique_documentation)
    return { error: 'La portée ne peut pas être vide (observation, activité ou documentation).' }
  if (out.nature_defaut && !NATURES.includes(out.nature_defaut)) return { error: 'Nature par défaut invalide' }
  const ok = !out.nature_defaut
    || (out.nature_defaut === 'observation' && out.applique_observation)
    || (out.nature_defaut === 'activite' && out.applique_activite)
    || (out.nature_defaut === 'mixte' && out.applique_observation && out.applique_activite)
  if (!ok) return { error: 'La nature par défaut doit être compatible avec la portée.' }
  return { value: out }
}

// Import CSV (format categories.csv du chantier) :
//   nom;emoji|icon;couleur;applique_observation;applique_activite;applique_documentation;nature_defaut;ordre[;nom_court]
// Upsert par nom (une catégorie existante est mise à jour, jamais supprimée).
export async function importCategoriesRows(wsId, rows) {
  const created = [], updated = [], errors = []
  const b = (v, def) => (v === undefined || v === '') ? def : ['1', 'true', 'oui', 'yes', 'x'].includes(String(v).toLowerCase().trim())
  for (const row of rows) {
    const nom = (row.nom || '').trim()
    if (!nom) continue
    const { value, error } = normalizeCategorie({
      nom,
      nom_court: row.nom_court,
      icon: row.emoji || row.icon || null,
      couleur: row.couleur || null,
      applique_observation: b(row.applique_observation, true),
      applique_activite: b(row.applique_activite, true),
      applique_documentation: b(row.applique_documentation, true),
      nature_defaut: (row.nature_defaut || '').trim() || null,
    })
    if (error) { errors.push(`${nom} : ${error}`); continue }
    const ordre = row.ordre !== undefined && row.ordre !== '' ? Number(row.ordre) : null
    const [ex] = await sql`SELECT id FROM jd_categorie WHERE workspace_id=${wsId} AND nom=${nom}`
    if (ex) {
      await sql`UPDATE jd_categorie SET
          icon = COALESCE(${value.icon}, icon), couleur = COALESCE(${value.couleur}, couleur),
          nom_court = COALESCE(${value.nom_court}, nom_court),
          applique_observation = ${value.applique_observation}, applique_activite = ${value.applique_activite},
          applique_documentation = ${value.applique_documentation}, nature_defaut = ${value.nature_defaut},
          ordre = COALESCE(${ordre}, ordre), actif = TRUE
        WHERE id = ${ex.id}`
      updated.push(nom)
    } else {
      const [{ max }] = await sql`SELECT COALESCE(MAX(ordre),0) AS max FROM jd_categorie WHERE workspace_id=${wsId}`
      await sql`INSERT INTO jd_categorie (workspace_id, nom, nom_court, icon, couleur,
          applique_observation, applique_activite, applique_documentation, nature_defaut, ordre)
        VALUES (${wsId}, ${nom}, ${value.nom_court}, ${value.icon}, ${value.couleur},
          ${value.applique_observation}, ${value.applique_activite}, ${value.applique_documentation},
          ${value.nature_defaut}, ${ordre ?? Number(max) + 1})`
      created.push(nom)
    }
  }
  return { created, updated, errors }
}

// ── Schémas de données étendues ──────────────────────────────

// Profondeur de remontée hiérarchique configurée sur le workspace.
export async function wsDepth(wsId) {
  const [r] = await sql`SELECT COALESCE(jd_search_depth,3) AS d FROM workspaces WHERE id=${wsId}`
  return r?.d ?? 3
}

// Chaîne d'ancêtres calculée en mémoire depuis une Map id → parent_id.
function chainFrom(parentOf, id, maxDepth) {
  if (!id) return []
  const chain = [Number(id)]
  let cur = Number(id), d = 0
  while (d < maxDepth) {
    const p = parentOf.get(cur)
    if (!p) break
    chain.push(p); cur = p; d++
  }
  return chain
}

// Choisit LE schéma applicable parmi `schemas` (actifs) pour un contexte à une seule
// catégorie au plus. Pur (pas d'accès base). Renvoie le schéma ou null.
//
// Tri : spécificité DESC (nb d'axes non-joker), puis DISTANCE d'ancêtre ASC, puis
// priorité d'axe DESC (objet > thème > catégorie|nature), puis id.
//
// ⚠️ La distance n'a de sens que pour les axes HIÉRARCHIQUES (objet, thème). Un schéma qui
// n'utilise QUE des axes non hiérarchiques (nature, catégorie) aurait une distance 0
// imméritée et gagnerait toujours → +∞ pour qu'il passe en dernier à spécificité égale.
//   • « Pommier Gala + Semer » → « Pommiers » (objet, dist 1) et non « toute Observation ».
//   • « Pommier Golden + Traitement » → « Traitement » (dist 0) et non « Arbres fruitiers »
//     (objet, dist 2) : le plus PROCHE gagne, quel que soit l'axe.
export function pickSchema(schemas, { chainO, chainT, categorieId, nature }) {
  const nat = nature ?? null
  const candidats = schemas.filter(c =>
    (c.objet_id == null || chainO.includes(c.objet_id))
    && (c.theme_id == null || chainT.includes(c.theme_id))
    && (c.categorie_id == null || c.categorie_id === (categorieId ?? null))
    // Une note « mixte » est à la fois observation et activité (comme les filtres).
    && (c.nature == null || c.nature === nat || (nat === 'mixte' && (c.nature === 'observation' || c.nature === 'activite'))))
  if (!candidats.length) return null
  const scored = candidats.map(c => ({
    c,
    score: (c.objet_id != null) + (c.theme_id != null) + (c.categorie_id != null) + (c.nature != null),
    dist: (c.objet_id != null || c.theme_id != null)
      ? (c.objet_id != null ? chainO.indexOf(c.objet_id) : 0) + (c.theme_id != null ? chainT.indexOf(c.theme_id) : 0)
      : Infinity,
    prio: (c.objet_id != null ? 4 : 0) + (c.theme_id != null ? 2 : 0)
        + ((c.categorie_id != null || c.nature != null) ? 1 : 0),
  }))
  scored.sort((a, b) => b.score - a.score || a.dist - b.dist || b.prio - a.prio || a.c.id - b.c.id)
  return scored[0].c
}

// FUSION (spec §5.2), pure : un schéma par catégorie (dans l'ordre), repli sur le joker si
// aucune catégorie ne résout ; union des champs dédupliqués par `cle` (1re occurrence fixe
// la position). Une note mono-catégorie produit exactement le résultat d'avant migration.
//
// Renvoie null (aucun schéma) ou :
//   { id, nom, champs, schemas: [{ id, nom, categorie_id, categorie_nom }] }
// où chaque champ porte `_schema` (id du schéma d'origine) pour le groupement à l'affichage.
// `id`/`nom` = forme compatible avec l'ancien « schéma unique » (1er id, noms joints).
export function fusionSchemas(schemas, { chainO, chainT, categorieIds = [], nature }, catNom = new Map()) {
  const retenus = []
  for (const categorieId of categorieIds) {
    const s = pickSchema(schemas, { chainO, chainT, categorieId, nature })
    if (s && !retenus.some(x => x.id === s.id)) retenus.push(s)
  }
  if (!retenus.length) {
    const s = pickSchema(schemas, { chainO, chainT, categorieId: null, nature })
    if (s) retenus.push(s)
  }
  if (!retenus.length) return null
  const champs = [], vus = new Set()
  for (const s of retenus)
    for (const ch of (Array.isArray(s.champs) ? s.champs : []))
      if (ch?.cle && !vus.has(ch.cle)) { champs.push({ ...ch, _schema: s.id }); vus.add(ch.cle) }
  return {
    id: retenus[0].id,
    nom: retenus.map(s => s.nom).join(' + '),
    champs,
    schemas: retenus.map(s => ({ id: s.id, nom: s.nom, categorie_id: s.categorie_id, categorie_nom: catNom.get(s.categorie_id) ?? null })),
  }
}

// Contexte de résolution d'un workspace, chargé une fois : schémas actifs, arbres, noms.
async function loadResolveCtx(wsId) {
  const [depth, schemas, objets, themes, cats] = await Promise.all([
    wsDepth(wsId),
    sql`SELECT * FROM jd_schema_donnees WHERE workspace_id = ${wsId} AND actif = TRUE`,
    sql`SELECT id, parent_id FROM jd_objets WHERE workspace_id = ${wsId}`,
    sql`SELECT id, parent_id FROM jd_themes WHERE workspace_id = ${wsId}`,
    sql`SELECT id, nom FROM jd_categorie WHERE workspace_id = ${wsId}`,
  ])
  return {
    depth, schemas,
    parentO: new Map(objets.map(r => [r.id, r.parent_id])),
    parentT: new Map(themes.map(r => [r.id, r.parent_id])),
    catNom: new Map(cats.map(r => [r.id, r.nom])),
  }
}

function fusionWith(ctx, { objetId, themeId, categorieIds, nature }) {
  return fusionSchemas(ctx.schemas, {
    chainO: chainFrom(ctx.parentO, objetId, ctx.depth),
    chainT: chainFrom(ctx.parentT, themeId, ctx.depth),
    categorieIds, nature,
  }, ctx.catNom)
}

// Fusion pour un contexte donné (éditeur de note, fiche).
export async function resolveSchemasFusion(wsId, { objetId, themeId, categorieIds = [], nature }) {
  return fusionWith(await loadResolveCtx(wsId), { objetId, themeId, categorieIds, nature })
}

// Recalcule les caches schema_donnees_ids (+ schema_donnees_id = le 1er, compat) des notes
// d'un workspace (toutes, ou `noteIds`). Résolution en mémoire : une poignée de requêtes de
// lecture, puis un UPDATE par note dont le cache change.
export async function recalcSchemasNotes(wsId, noteIds = null) {
  const ctx = await loadResolveCtx(wsId)
  const notes = noteIds
    ? await sql`SELECT id, nature, objet_principal_id, theme_id, schema_donnees_ids FROM jd_notes WHERE workspace_id=${wsId} AND id = ANY(${noteIds})`
    : await sql`SELECT id, nature, objet_principal_id, theme_id, schema_donnees_ids FROM jd_notes WHERE workspace_id=${wsId}`
  const ids = notes.map(n => n.id)
  const liaisons = ids.length
    ? await sql`SELECT note_id, categorie_id FROM jd_note_categorie WHERE note_id = ANY(${ids}) ORDER BY note_id, ordre`
    : []
  const catsOf = new Map(ids.map(id => [id, []]))
  for (const l of liaisons) catsOf.get(l.note_id)?.push(l.categorie_id)
  let changed = 0
  for (const n of notes) {
    const f = fusionWith(ctx, { objetId: n.objet_principal_id, themeId: n.theme_id, categorieIds: catsOf.get(n.id), nature: n.nature })
    const nouveaux = f ? f.schemas.map(s => s.id) : null
    if (JSON.stringify(nouveaux) === JSON.stringify(n.schema_donnees_ids ?? null)) continue
    await sql`UPDATE jd_notes SET schema_donnees_id=${nouveaux?.[0] ?? null}, schema_donnees_ids=${nouveaux} WHERE id=${n.id}`
    changed++
  }
  return changed
}

// Recalcule le cache d'une note (après création / modification).
export async function recalcSchemaNote(wsId, noteId) {
  return recalcSchemasNotes(wsId, [noteId])
}

// Validateur d'unicité sémantique des clés (spec §5.3) : refuse un schéma qui réutilise une
// `cle` déjà présente dans le workspace avec un type, des options ou une unité différents.
// Renvoie null si OK, sinon un message nommant le schéma en conflit.
export async function conflitCles(wsId, champs, excludeId = null) {
  const autres = await sql`
    SELECT id, nom, champs FROM jd_schema_donnees
    WHERE workspace_id = ${wsId} AND id <> ${excludeId ?? 0}`
  const sig = ch => JSON.stringify([ch.type ?? null, ch.options ?? null, ch.unite ?? null,
    ch.type === 'echelle' ? [ch.min ?? 1, ch.max ?? 5] : null])
  for (const ch of (Array.isArray(champs) ? champs : [])) {
    if (!ch?.cle) continue
    for (const s of autres) {
      const o = (Array.isArray(s.champs) ? s.champs : []).find(x => x?.cle === ch.cle)
      if (o && sig(o) !== sig(ch))
        return `La clé « ${ch.cle} » existe déjà dans le schéma « ${s.nom} » avec une définition différente `
          + `(type, options, unité ou échelle). Alignez les définitions ou renommez la clé : `
          + `les schémas de plusieurs catégories fusionnent par clé.`
    }
  }
  return null
}
