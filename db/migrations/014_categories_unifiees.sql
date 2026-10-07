-- 014 — Catégories unifiées et multiples (spec : docs/chantiers/categories/MIGRATION-categories.md)
--
-- Une table unique jd_categorie remplace jd_doc_categorie et accueillera les interventions
-- du journal (extraites des thèmes par db/migrate-interventions.js, par workspace).
-- Chaque catégorie déclare sa PORTÉE (observation / activité / documentation).
-- Une note porte 0..N catégories via jd_note_categorie (ordre = affichage seulement :
-- la 1re donne la couleur de pastille et mène le titre).
--
-- Partie GLOBALE et ADDITIVE : rien n'est supprimé. jd_doc_categorie, jd_notes.doc_categorie_id
-- et jd_schema_donnees.doc_categorie_id sont CONSERVÉS (gelés) pour rollback, puis supprimés
-- par une migration ultérieure une fois la structure validée en usage réel.
--
-- Écarts assumés par rapport à la spec (alignement sur le code réel) :
--   • `icon` (et non `emoji`) — même nom que jd_doc_categorie / jd_doc_statut ;
--   • `nom_court` — repris des thèmes d'intervention, sert au titre court auto-généré ;
--   • `origine_doc_categorie_id` / `origine_theme_id` — traçabilité de la migration
--     (idempotence, rollback, compat d'anciens clients). Pas de FK : les thèmes d'origine
--     sont supprimés par la migration des interventions.
--   • Le cache jd_notes.schema_donnees_id (1 schéma) devient schema_donnees_ids (fusion) ;
--     l'ancienne colonne reste alimentée avec le 1er schéma (compat).

CREATE TABLE IF NOT EXISTS jd_categorie (
  id                       SERIAL PRIMARY KEY,
  workspace_id             INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id                INTEGER REFERENCES jd_categorie(id) ON DELETE SET NULL,  -- posé, non exploité
  nom                      TEXT    NOT NULL,
  nom_court                TEXT,
  icon                     TEXT,
  couleur                  TEXT,
  applique_observation     BOOLEAN NOT NULL DEFAULT TRUE,
  applique_activite        BOOLEAN NOT NULL DEFAULT TRUE,
  applique_documentation   BOOLEAN NOT NULL DEFAULT TRUE,
  nature_defaut            TEXT,
  ordre                    INTEGER NOT NULL DEFAULT 0,
  actif                    BOOLEAN NOT NULL DEFAULT TRUE,
  origine_doc_categorie_id INTEGER,
  origine_theme_id         INTEGER,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cat_nom_unique_ws UNIQUE (workspace_id, nom),
  CONSTRAINT cat_portee_non_vide CHECK (
    applique_observation OR applique_activite OR applique_documentation
  ),
  CONSTRAINT cat_nature_defaut_valide CHECK (
    nature_defaut IS NULL OR nature_defaut IN ('observation','activite','mixte')
  ),
  CONSTRAINT cat_nature_defaut_coherente CHECK (
    nature_defaut IS NULL
    OR (nature_defaut = 'observation' AND applique_observation)
    OR (nature_defaut = 'activite'    AND applique_activite)
    OR (nature_defaut = 'mixte'       AND applique_observation AND applique_activite)
  )
);

CREATE INDEX IF NOT EXISTS idx_categorie_ws     ON jd_categorie (workspace_id, actif);
CREATE INDEX IF NOT EXISTS idx_categorie_parent ON jd_categorie (parent_id);

CREATE TABLE IF NOT EXISTS jd_note_categorie (
  note_id      INTEGER NOT NULL REFERENCES jd_notes(id)     ON DELETE CASCADE,
  categorie_id INTEGER NOT NULL REFERENCES jd_categorie(id) ON DELETE CASCADE,
  ordre        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (note_id, categorie_id)
);

CREATE INDEX IF NOT EXISTS idx_note_categorie_cat ON jd_note_categorie (categorie_id);

ALTER TABLE jd_schema_donnees ADD COLUMN IF NOT EXISTS categorie_id INTEGER
  REFERENCES jd_categorie(id) ON DELETE CASCADE;

ALTER TABLE jd_notes ADD COLUMN IF NOT EXISTS schema_donnees_ids INTEGER[];

-- Étape 1 — reprise des catégories de documentation (tous workspaces), portée doc seule.
INSERT INTO jd_categorie
  (workspace_id, nom, icon, couleur, ordre, actif,
   applique_observation, applique_activite, applique_documentation, origine_doc_categorie_id)
SELECT d.workspace_id, d.nom, d.icon, d.couleur, COALESCE(d.ordre, 0), TRUE,
       FALSE, FALSE, TRUE, d.id
FROM jd_doc_categorie d
WHERE NOT EXISTS (SELECT 1 FROM jd_categorie c WHERE c.origine_doc_categorie_id = d.id);

-- Étape 3a — affectation des notes de documentation.
INSERT INTO jd_note_categorie (note_id, categorie_id, ordre)
SELECT n.id, c.id, 0
FROM jd_notes n
JOIN jd_categorie c ON c.origine_doc_categorie_id = n.doc_categorie_id
ON CONFLICT DO NOTHING;

-- Étape 4a — schémas pilotés par une catégorie de documentation.
UPDATE jd_schema_donnees s
SET categorie_id = c.id
FROM jd_categorie c
WHERE c.origine_doc_categorie_id = s.doc_categorie_id
  AND s.categorie_id IS NULL;

-- Unicité du contexte : l'axe catégorie remplace doc_categorie_id.
ALTER TABLE jd_schema_donnees DROP CONSTRAINT IF EXISTS uniq_schema_contexte;
ALTER TABLE jd_schema_donnees ADD CONSTRAINT uniq_schema_contexte
  UNIQUE NULLS NOT DISTINCT (workspace_id, objet_id, theme_id, categorie_id, nature);
