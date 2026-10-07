-- JourDoc V2 — schéma PostgreSQL
-- Porté depuis SQLite V1. Différences principales :
--   AUTOINCREMENT → SERIAL
--   DATETIME      → TIMESTAMPTZ
--   BOOLEAN 0/1   → BOOLEAN natif
--   INSERT OR IGNORE → ON CONFLICT DO NOTHING

-- ─────────────────────────────────────────────
-- Portail (users, apps, workspaces, droits)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apps (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS workspaces (
  id                    SERIAL PRIMARY KEY,
  app_id                INTEGER REFERENCES apps(id),
  name                  TEXT NOT NULL,
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  jd_search_depth       INTEGER DEFAULT 3,
  jd_picker_mode_mobile  TEXT DEFAULT 'filter',
  jd_picker_mode_desktop TEXT DEFAULT 'scroll',
  todoist_token         TEXT,
  todoist_project_id    TEXT,
  todoist_project_nom   TEXT,
  todoist_synced_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_app_access (
  user_id INTEGER REFERENCES users(id),
  app_id  INTEGER REFERENCES apps(id),
  PRIMARY KEY (user_id, app_id)
);

CREATE TABLE IF NOT EXISTS user_workspace_access (
  user_id      INTEGER REFERENCES users(id),
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  role         TEXT DEFAULT 'member',
  PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS admin (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  otp_secret    TEXT,
  otp_code      TEXT,
  otp_expires   TEXT
);

-- ─────────────────────────────────────────────
-- JourDoc — tables métier
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jd_objets (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES jd_objets(id),
  nom          TEXT NOT NULL,
  nom_court    TEXT,
  est_individu BOOLEAN DEFAULT FALSE,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jd_themes (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES jd_themes(id),
  nom          TEXT NOT NULL,
  nom_court    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jd_elements (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, nom)
);

-- Catégories de documentation (sous-natures gérables par workspace)
CREATE TABLE IF NOT EXISTS jd_doc_categorie (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  icon         TEXT,
  couleur      TEXT,
  ordre        INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, nom)
);

-- Statuts de documentation (gérables par workspace)
CREATE TABLE IF NOT EXISTS jd_doc_statut (
  id           SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  icon         TEXT,
  couleur      TEXT,
  ordre        INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, nom)
);

CREATE TABLE IF NOT EXISTS jd_notes (
  id              SERIAL PRIMARY KEY,
  workspace_id    INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('journal', 'documentation')),
  nature          TEXT CHECK (nature IN ('observation', 'activite', 'mixte')),
  theme_id        INTEGER REFERENCES jd_themes(id),
  doc_categorie_id INTEGER REFERENCES jd_doc_categorie(id) ON DELETE SET NULL,
  doc_statut_id   INTEGER REFERENCES jd_doc_statut(id) ON DELETE SET NULL,
  doc_auteur      TEXT,
  doc_reference   TEXT,
  titre           TEXT,
  titre_alt       TEXT,
  contenu         TEXT,
  date            DATE,
  source_url      TEXT,
  donnees_etendues JSONB,   -- Données étendues : objet { cle: valeur } (V2.1, cf. migration 011)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  tache_todoist_id              TEXT,
  tache_todoist_due             TEXT,
  tache_todoist_priority        INTEGER,
  tache_todoist_done            BOOLEAN DEFAULT FALSE,
  tache_todoist_recurrence_done BOOLEAN DEFAULT FALSE,
  tache_todoist_consigne        BOOLEAN DEFAULT FALSE,
  tache_todoist_content         TEXT
);

CREATE TABLE IF NOT EXISTS jd_note_objet (
  note_id  INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  objet_id INTEGER REFERENCES jd_objets(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, objet_id)
);

CREATE TABLE IF NOT EXISTS jd_note_theme (
  note_id  INTEGER REFERENCES jd_notes(id)  ON DELETE CASCADE,
  theme_id INTEGER REFERENCES jd_themes(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, theme_id)
);

CREATE TABLE IF NOT EXISTS jd_note_note (
  note_source_id INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  note_cible_id  INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  type_lien      TEXT,
  PRIMARY KEY (note_source_id, note_cible_id)
);

CREATE TABLE IF NOT EXISTS jd_note_element (
  note_id    INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  element_id INTEGER REFERENCES jd_elements(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, element_id)
);

-- Colonnes alignées sur les noms V1 pour la route portée directement
CREATE TABLE IF NOT EXISTS jd_medias (
  id            SERIAL PRIMARY KEY,
  workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  fichier       TEXT NOT NULL,       -- chemin complet sur KDrive (webdav_path + filename)
  nom_original  TEXT,
  type_media    TEXT,                -- 'photo' | 'pdf'
  mime_type     TEXT,
  taille        INTEGER,
  date_prise    DATE,
  lie           BOOLEAN DEFAULT FALSE,
  externe       BOOLEAN DEFAULT FALSE,  -- TRUE = fichier lié (externe), non supprimé au détachement
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jd_note_media (
  note_id  INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES jd_medias(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, media_id)
);

-- Tâches Todoist : N par note (source de vérité). Les colonnes jd_notes.tache_todoist_*
-- restent comme CACHE de la tâche la plus urgente (badge + listes). Cf. migration 009.
CREATE TABLE IF NOT EXISTS jd_note_todoist (
  id              SERIAL PRIMARY KEY,
  note_id         INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  workspace_id    INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  todoist_id      TEXT NOT NULL,
  content         TEXT,
  due             TEXT,
  priority        INTEGER,
  done            BOOLEAN DEFAULT FALSE,
  recurrence_done BOOLEAN DEFAULT FALSE,
  consigne        BOOLEAN DEFAULT FALSE,
  urgence         INTEGER DEFAULT 0,   -- 2 + priorité + bucket de délai (cf. computeUrgence)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (note_id, todoist_id)
);

-- Catégories unifiées (migration 014) : journal (« Interventions ») + documentation
-- (« Apports »), portée déclarée, N par note. Remplace jd_doc_categorie (conservée, gelée).
CREATE TABLE IF NOT EXISTS jd_categorie (
  id                       SERIAL PRIMARY KEY,
  workspace_id             INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id                INTEGER REFERENCES jd_categorie(id) ON DELETE SET NULL,
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
  CONSTRAINT cat_portee_non_vide CHECK (applique_observation OR applique_activite OR applique_documentation),
  CONSTRAINT cat_nature_defaut_valide CHECK (nature_defaut IS NULL OR nature_defaut IN ('observation','activite','mixte')),
  CONSTRAINT cat_nature_defaut_coherente CHECK (
    nature_defaut IS NULL
    OR (nature_defaut = 'observation' AND applique_observation)
    OR (nature_defaut = 'activite'    AND applique_activite)
    OR (nature_defaut = 'mixte'       AND applique_observation AND applique_activite))
);

CREATE TABLE IF NOT EXISTS jd_note_categorie (
  note_id      INTEGER NOT NULL REFERENCES jd_notes(id)     ON DELETE CASCADE,
  categorie_id INTEGER NOT NULL REFERENCES jd_categorie(id) ON DELETE CASCADE,
  ordre        INTEGER NOT NULL DEFAULT 0,      -- 1re = couleur de pastille + tête du titre
  PRIMARY KEY (note_id, categorie_id)
);

-- Schémas de données étendues (migrations 012 + 014) : contexte objet × thème × catégorie × nature.
CREATE TABLE IF NOT EXISTS jd_schema_donnees (
  id               SERIAL PRIMARY KEY,
  workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nom              TEXT NOT NULL,
  objet_id         INTEGER REFERENCES jd_objets(id) ON DELETE CASCADE,
  theme_id         INTEGER REFERENCES jd_themes(id) ON DELETE CASCADE,
  categorie_id     INTEGER REFERENCES jd_categorie(id) ON DELETE CASCADE,
  doc_categorie_id INTEGER REFERENCES jd_doc_categorie(id) ON DELETE CASCADE,  -- gelée (rollback 014)
  nature           TEXT CHECK (nature IN ('observation', 'activite', 'mixte')),
  champs           JSONB NOT NULL DEFAULT '[]'::jsonb,
  actif            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_schema_contexte
    UNIQUE NULLS NOT DISTINCT (workspace_id, objet_id, theme_id, categorie_id, nature)
);

-- Colonnes de jd_notes ajoutées par les migrations 012 et 014.
ALTER TABLE jd_notes ADD COLUMN IF NOT EXISTS objet_principal_id INTEGER REFERENCES jd_objets(id) ON DELETE SET NULL;
ALTER TABLE jd_notes ADD COLUMN IF NOT EXISTS schema_donnees_id  INTEGER REFERENCES jd_schema_donnees(id) ON DELETE SET NULL;
ALTER TABLE jd_notes ADD COLUMN IF NOT EXISTS schema_donnees_ids INTEGER[];   -- cache de fusion (014)

-- ─────────────────────────────────────────────
-- Index utiles
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jd_notes_workspace  ON jd_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_date       ON jd_notes(date);
CREATE INDEX IF NOT EXISTS idx_jd_notes_theme      ON jd_notes(theme_id);
CREATE INDEX IF NOT EXISTS idx_jd_note_theme_theme ON jd_note_theme(theme_id);
CREATE INDEX IF NOT EXISTS idx_jd_doc_categorie_ws    ON jd_doc_categorie(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_doc_categorie ON jd_notes(doc_categorie_id);
CREATE INDEX IF NOT EXISTS idx_jd_doc_statut_ws       ON jd_doc_statut(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_doc_statut    ON jd_notes(doc_statut_id);
CREATE INDEX IF NOT EXISTS idx_jd_objets_workspace ON jd_objets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_themes_workspace ON jd_themes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_medias_workspace ON jd_medias(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_elements_ws      ON jd_elements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_note_todoist_note ON jd_note_todoist(note_id);
CREATE INDEX IF NOT EXISTS idx_jd_note_todoist_ws   ON jd_note_todoist(workspace_id);
CREATE INDEX IF NOT EXISTS idx_categorie_ws        ON jd_categorie (workspace_id, actif);
CREATE INDEX IF NOT EXISTS idx_categorie_parent    ON jd_categorie (parent_id);
CREATE INDEX IF NOT EXISTS idx_note_categorie_cat  ON jd_note_categorie (categorie_id);
CREATE INDEX IF NOT EXISTS idx_jd_schema_donnees_ws ON jd_schema_donnees (workspace_id);
