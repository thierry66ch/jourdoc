-- 012 — Schémas de données contextuels (Phase B) — JourDoc V2.1
--
-- Un schéma définit les CHAMPS proposés pour les données étendues d'une note, selon un
-- CONTEXTE composé de 4 axes, tous nullables indépendamment (NULL = joker « quel que soit ») :
--   objet_id, theme_id, doc_categorie_id (documentation), nature (journal).
--
-- ⚠️ UNIQUE NULLS NOT DISTINCT (PG ≥ 15) : indispensable ici. Avec l'unicité standard,
-- les NULL sont considérés DISTINCTS → deux schémas identiques comportant un joker
-- seraient tous deux acceptés, et la contrainte serait inopérante dans la majorité des cas
-- (le joker est le cas courant).

CREATE TABLE IF NOT EXISTS jd_schema_donnees (
  id               SERIAL PRIMARY KEY,
  workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nom              TEXT NOT NULL,
  objet_id         INTEGER REFERENCES jd_objets(id) ON DELETE CASCADE,
  theme_id         INTEGER REFERENCES jd_themes(id) ON DELETE CASCADE,
  doc_categorie_id INTEGER REFERENCES jd_doc_categorie(id) ON DELETE CASCADE,
  nature           TEXT CHECK (nature IN ('observation', 'activite', 'mixte')),
  champs           JSONB NOT NULL DEFAULT '[]'::jsonb,
  actif            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uniq_schema_contexte
    UNIQUE NULLS NOT DISTINCT (workspace_id, objet_id, theme_id, doc_categorie_id, nature)
);

CREATE INDEX IF NOT EXISTS idx_jd_schema_donnees_ws ON jd_schema_donnees(workspace_id);

-- Objet « principal » d'une note : sert à résoudre le schéma de façon déterministe
-- (une note peut porter plusieurs objets, sans ordre garanti dans jd_note_objet).
-- Initialisé au 1er objet lié, modifiable dans le formulaire.
ALTER TABLE jd_notes ADD COLUMN IF NOT EXISTS objet_principal_id INTEGER
  REFERENCES jd_objets(id) ON DELETE SET NULL;

-- Cache du schéma résolu à l'enregistrement (affichage rapide de la fiche sans recalcul).
ALTER TABLE jd_notes ADD COLUMN IF NOT EXISTS schema_donnees_id INTEGER
  REFERENCES jd_schema_donnees(id) ON DELETE SET NULL;
