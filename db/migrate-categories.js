// Migration « Catégories unifiées et multiples » (spec : docs/chantiers/categories/).
//
//   node --env-file=.env.local db/migrate-categories.js            → rapport seul (lecture)
//   node --env-file=.env.local db/migrate-categories.js --apply    → exécute
//
// Étapes (--apply) :
//   0. Sauvegarde JSON des tables touchées (../mig_data/backup-categories-<horodatage>.json).
//   1. DDL + reprise globale des catégories de documentation : 014_categories_unifiees.sql
//      (idempotent, une transaction).
//   2. Par workspace configuré (WORKSPACES) : extraction des interventions (descendants de la
//      racine de thèmes) → catégories, liaisons, bascule des schémas, nettoyage des thèmes.
//      UNE transaction par workspace ; l'ordre interne n'est pas commutatif (spec §4.2 :
//      les schémas basculent AVANT la suppression des thèmes, sinon ON DELETE CASCADE les
//      emporterait).
//   3. Alignement du référentiel (renommages, désactivations, import CSV de la cible).
//   4. Recalcul des caches de schémas (fusion) des notes du workspace.
//   5. Vérifications post-migration (spec §4.3).
//
// Rejouable : un workspace dont la racine d'interventions a disparu est sauté à l'étape 2.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sql from './db.js'
import { importCategoriesRows, recalcSchemasNotes } from '../server/lib/categories.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APPLY = process.argv.includes('--apply')

// Portées : [observation, activité, documentation, nature_defaut]
const ACT = [false, true, false, null]
const OBS = [true, false, false, null]
const OBS_ACT = d => [true, true, false, d]

const WORKSPACES = [
  {
    ws: 3, nom: 'Trains', racine: 'int',
    portees: {
      'Dégât': OBS, 'Idée': OBS, 'Visite': OBS,
      'Réflexion': ACT, 'Construction': ACT, 'Entretien': ACT,
      'Roulement': OBS_ACT('mixte'), 'Essai': OBS_ACT('activite'),
      'Réparation': ACT, 'Rénovation': ACT, 'Achat': ACT,
      // Hors cible, conservées (arbitrage du 2026-10-07) :
      'Inspection': OBS_ACT('activite'), 'Décision': ACT, 'Décret': ACT, 'Projet': ACT,
    },
    defaut: ACT,
    // Alignement sur categories.csv (arbitrage : Conseil → Tutoriel, Produits → Produit,
    // Manuel désactivé ; Inspection conservée à côté de « Contrôle technique »).
    renommer: { 'Conseil': 'Tutoriel', 'Produits': 'Produit' },
    desactiver: ['Manuel'],
    csv: join(__dirname, '../docs/chantiers/categories/categories.csv'),
  },
  {
    ws: 6, nom: 'Ménage', racine: 'inter',
    portees: { 'Inspection': OBS_ACT('activite') },
    defaut: ACT,
  },
]

const log = (...a) => console.log(...a)
const table = (t, rows) => { log(`\n### ${t}`); rows.length ? console.table(rows) : log('  (aucun)') }

// ── Rapport (lecture seule) ──────────────────────────────────

async function racineDe(cfg) {
  const [r] = await sql`SELECT id FROM jd_themes WHERE workspace_id=${cfg.ws} AND parent_id IS NULL AND nom_court=${cfg.racine}`
  return r?.id ?? null
}

async function descendants(rootId) {
  const rows = await sql`
    WITH RECURSIVE sous(id, depth) AS (
      SELECT id, 1 FROM jd_themes WHERE parent_id = ${rootId}
      UNION ALL SELECT t.id, s.depth + 1 FROM jd_themes t JOIN sous s ON t.parent_id = s.id
    )
    SELECT t.id, t.nom, t.nom_court, t.parent_id, s.depth FROM sous s JOIN jd_themes t ON t.id = s.id
    ORDER BY s.depth, t.nom`
  return rows
}

async function rapport(cfg) {
  log(`\n════════ Workspace ${cfg.ws} — ${cfg.nom} ════════`)
  const rootId = await racineDe(cfg)
  if (!rootId) { log(`Racine « ${cfg.racine} » absente : interventions déjà migrées (ou inexistantes).`); return null }
  const inter = await descendants(rootId)
  const ids = inter.map(t => t.id)
  table('Interventions → catégories (portée)', inter.map(t => {
    const p = cfg.portees[t.nom] ?? cfg.defaut
    return { theme: t.id, nom: t.nom, nom_court: t.nom_court, profondeur: t.depth,
      obs: p[0] ? '✓' : '', act: p[1] ? '✓' : '', doc: p[2] ? '✓' : '', nature_defaut: p[3] ?? '' }
  }))
  table('§4.1 Notes de journal SANS intervention (arbitrage humain)', await sql`
    SELECT n.id, to_char(n.date,'YYYY-MM-DD') AS date, n.nature, left(coalesce(n.titre,''),60) AS titre
    FROM jd_notes n WHERE n.workspace_id=${cfg.ws} AND n.type='journal'
      AND NOT EXISTS (SELECT 1 FROM jd_note_theme nt WHERE nt.note_id=n.id AND nt.theme_id = ANY(${ids}))
    ORDER BY n.date DESC`)
  table('Notes qui porteront plusieurs catégories', await sql`
    SELECT n.id, left(coalesce(n.titre,''),50) AS titre, string_agg(t.nom, ' + ' ORDER BY (t.id = n.theme_id) DESC, t.nom) AS interventions
    FROM jd_notes n JOIN jd_note_theme nt ON nt.note_id=n.id JOIN jd_themes t ON t.id=nt.theme_id
    WHERE n.workspace_id=${cfg.ws} AND nt.theme_id = ANY(${ids})
    GROUP BY n.id HAVING count(*) > 1`)
  table('Schémas pilotés par une intervention (basculeront sur l\'axe catégorie)', await sql`
    SELECT s.id, s.nom, s.objet_id, (SELECT nom FROM jd_themes WHERE id=s.theme_id) AS intervention, s.nature
    FROM jd_schema_donnees s WHERE s.workspace_id=${cfg.ws} AND s.theme_id = ANY(${ids})`)
  const bloquants = await sql`
    SELECT id, nom FROM jd_schema_donnees
    WHERE workspace_id=${cfg.ws} AND theme_id = ANY(${ids}) AND doc_categorie_id IS NOT NULL`
  if (bloquants.length) table('⚠️ BLOQUANT : schémas à la fois sur une intervention ET une catégorie doc', bloquants)
  return { rootId, inter, ids, bloquant: bloquants.length > 0 }
}

async function conflitsCles() {
  table('§5.3 Conflits de clés (même clé, définitions divergentes)', await sql`
    SELECT s.workspace_id AS ws, c->>'cle' AS cle,
      count(DISTINCT c->>'type')::int AS types, count(DISTINCT (c->'options')::text)::int AS options,
      count(DISTINCT c->>'unite')::int AS unites, array_agg(DISTINCT s.nom) AS schemas
    FROM jd_schema_donnees s, jsonb_array_elements(s.champs) c
    GROUP BY 1, 2
    HAVING count(DISTINCT c->>'type') > 1 OR count(DISTINCT (c->'options')::text) > 1 OR count(DISTINCT c->>'unite') > 1`)
}

// ── Écritures ────────────────────────────────────────────────

async function sauvegarde() {
  const dump = {}
  for (const t of ['jd_themes', 'jd_note_theme', 'jd_doc_categorie', 'jd_schema_donnees'])
    dump[t] = await sql(`SELECT * FROM ${t}`)
  dump.jd_notes = await sql`SELECT id, workspace_id, type, nature, theme_id, doc_categorie_id, schema_donnees_id FROM jd_notes`
  const dir = join(__dirname, '../../mig_data')
  mkdirSync(dir, { recursive: true })
  const f = join(dir, `backup-categories-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(f, JSON.stringify(dump, null, 1))
  log(`\n💾 Sauvegarde : ${f}`)
}

async function ddl014() {
  const raw = readFileSync(join(__dirname, 'migrations/014_categories_unifiees.sql'), 'utf8')
  const stmts = raw.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    .split(';').map(s => s.trim()).filter(Boolean)
  await sql.transaction(stmts.map(s => sql(s)))
  log(`\n✓ 014 appliquée (${stmts.length} instructions, une transaction)`)
}

async function migrerInterventions(cfg, r) {
  const { rootId, inter, ids } = r
  const tous = [...ids, rootId]
  const q = []
  // Étape 2 — interventions → catégories (fusion de portée si le nom existe déjà).
  for (const t of inter) {
    const [o, a, d, nd] = cfg.portees[t.nom] ?? cfg.defaut
    q.push(sql`
      INSERT INTO jd_categorie (workspace_id, nom, nom_court, ordre, actif,
        applique_observation, applique_activite, applique_documentation, nature_defaut, origine_theme_id)
      VALUES (${cfg.ws}, ${t.nom}, ${t.nom_court}, 100, TRUE, ${o}, ${a}, ${d}, ${nd}, ${t.id})
      ON CONFLICT (workspace_id, nom) DO UPDATE SET
        applique_observation = jd_categorie.applique_observation OR EXCLUDED.applique_observation,
        applique_activite    = jd_categorie.applique_activite    OR EXCLUDED.applique_activite,
        nature_defaut        = COALESCE(EXCLUDED.nature_defaut, jd_categorie.nature_defaut),
        nom_court            = COALESCE(jd_categorie.nom_court, EXCLUDED.nom_court),
        origine_theme_id     = COALESCE(jd_categorie.origine_theme_id, EXCLUDED.origine_theme_id)`)
  }
  // Étape 3 — affectation : l'intervention principale (cache theme_id) d'abord, puis par nom,
  // à la suite des catégories déjà portées par la note.
  q.push(sql`
    INSERT INTO jd_note_categorie (note_id, categorie_id, ordre)
    SELECT x.note_id, x.categorie_id,
           COALESCE((SELECT max(ordre) + 1 FROM jd_note_categorie e WHERE e.note_id = x.note_id), 0) + x.rang
    FROM (
      SELECT nt.note_id, c.id AS categorie_id,
             row_number() OVER (PARTITION BY nt.note_id ORDER BY (nt.theme_id = n.theme_id) DESC, t.nom) - 1 AS rang
      FROM jd_note_theme nt
      JOIN jd_notes n     ON n.id = nt.note_id
      JOIN jd_themes t    ON t.id = nt.theme_id
      JOIN jd_categorie c ON c.workspace_id = ${cfg.ws} AND c.origine_theme_id = nt.theme_id
      WHERE nt.theme_id = ANY(${ids})
    ) x
    ON CONFLICT DO NOTHING`)
  // Étape 4 — bascule des schémas (AVANT la suppression des thèmes : FK ON DELETE CASCADE).
  q.push(sql`
    UPDATE jd_schema_donnees s SET categorie_id = c.id, theme_id = NULL
    FROM jd_categorie c
    WHERE c.workspace_id = ${cfg.ws} AND c.origine_theme_id = s.theme_id
      AND s.theme_id = ANY(${ids}) AND s.categorie_id IS NULL`)
  // Cache « thème principal » : passe au 1er thème restant (FK sans action → à faire avant).
  q.push(sql`
    UPDATE jd_notes n SET theme_id = (
      SELECT nt.theme_id FROM jd_note_theme nt JOIN jd_themes t ON t.id = nt.theme_id
      WHERE nt.note_id = n.id AND NOT (nt.theme_id = ANY(${tous})) ORDER BY t.nom LIMIT 1)
    WHERE n.theme_id = ANY(${tous})`)
  // Étapes 5 et 6 — nettoyage des liaisons puis des thèmes (racine comprise).
  q.push(sql`DELETE FROM jd_note_theme WHERE theme_id = ANY(${tous})`)
  q.push(sql`DELETE FROM jd_themes WHERE workspace_id = ${cfg.ws} AND id = ANY(${tous})`)
  await sql.transaction(q)
  log(`✓ ws${cfg.ws} : ${inter.length} interventions migrées, ${tous.length} thèmes supprimés (une transaction)`)
}

async function aligner(cfg) {
  for (const [ancien, nouveau] of Object.entries(cfg.renommer ?? {})) {
    const [deja] = await sql`SELECT id FROM jd_categorie WHERE workspace_id=${cfg.ws} AND nom=${nouveau}`
    if (deja) { log(`  · « ${nouveau} » existe déjà — renommage de « ${ancien} » ignoré`); continue }
    const r = await sql`UPDATE jd_categorie SET nom=${nouveau} WHERE workspace_id=${cfg.ws} AND nom=${ancien} RETURNING id`
    if (r.length) log(`  · renommée : ${ancien} → ${nouveau}`)
  }
  for (const nom of cfg.desactiver ?? []) {
    const r = await sql`UPDATE jd_categorie SET actif=FALSE WHERE workspace_id=${cfg.ws} AND nom=${nom} AND actif RETURNING id`
    if (r.length) log(`  · désactivée : ${nom}`)
  }
  if (cfg.csv) {
    const lines = readFileSync(cfg.csv, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim())
    const headers = lines[0].split(';').map(h => h.trim().toLowerCase())
    const rows = lines.slice(1).map(l => Object.fromEntries(l.split(';').map((v, i) => [headers[i], v.trim()])))
    const r = await importCategoriesRows(cfg.ws, rows)
    log(`  · import CSV : ${r.created.length} créées (${r.created.join(', ') || '—'}), ${r.updated.length} mises à jour${r.errors.length ? `, erreurs : ${r.errors.join(' ; ')}` : ''}`)
  }
}

async function verifier(cfg) {
  table(`ws${cfg.ws} — §4.3 notes de journal sans catégorie`, await sql`
    SELECT n.id, left(coalesce(n.titre,''),60) AS titre FROM jd_notes n
    WHERE n.workspace_id=${cfg.ws} AND n.type='journal'
      AND NOT EXISTS (SELECT 1 FROM jd_note_categorie WHERE note_id = n.id)`)
  table(`ws${cfg.ws} — schémas`, await sql`
    SELECT id, nom, objet_id, theme_id, categorie_id, (SELECT nom FROM jd_categorie WHERE id=s.categorie_id) AS categorie, nature
    FROM jd_schema_donnees s WHERE workspace_id=${cfg.ws} ORDER BY id`)
  table(`ws${cfg.ws} — incohérences portée / nature`, await sql`
    SELECT n.id, n.nature, c.nom FROM jd_notes n
    JOIN jd_note_categorie nc ON nc.note_id = n.id JOIN jd_categorie c ON c.id = nc.categorie_id
    WHERE n.workspace_id=${cfg.ws} AND n.type = 'journal'
      AND ((n.nature = 'observation' AND NOT c.applique_observation)
        OR (n.nature = 'activite' AND NOT c.applique_activite))`)
  table(`ws${cfg.ws} — catégories`, await sql`
    SELECT c.id, c.nom, c.icon, c.applique_observation AS obs, c.applique_activite AS act,
      c.applique_documentation AS doc, c.nature_defaut, c.ordre, c.actif,
      (SELECT count(*)::int FROM jd_note_categorie nc WHERE nc.categorie_id = c.id) AS notes
    FROM jd_categorie c WHERE workspace_id=${cfg.ws} ORDER BY ordre, nom`)
}

// ── Main ─────────────────────────────────────────────────────

log(APPLY ? '=== MIGRATION (--apply) ===' : '=== RAPPORT (lecture seule — ajouter --apply pour exécuter) ===')
await conflitsCles()
const plans = []
for (const cfg of WORKSPACES) plans.push([cfg, await rapport(cfg)])

if (APPLY) {
  if (plans.some(([, r]) => r?.bloquant)) { log('\n✗ Arrêt : cas bloquant signalé ci-dessus.'); process.exit(1) }
  await sauvegarde()
  await ddl014()
  for (const [cfg, r] of plans) {
    log(`\n── ws${cfg.ws} — ${cfg.nom}`)
    if (r) await migrerInterventions(cfg, r)
    await aligner(cfg)
  }
  // Caches de fusion : tous les workspaces (les catégories doc ont été reprises partout).
  const ws = await sql`SELECT DISTINCT workspace_id FROM jd_notes ORDER BY 1`
  for (const { workspace_id } of ws) {
    const n = await recalcSchemasNotes(workspace_id)
    log(`✓ ws${workspace_id} : cache de schémas recalculé (${n} note(s) modifiée(s))`)
  }
  for (const [cfg] of plans) await verifier(cfg)
}
process.exit(0)
