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
  todoist_token         TEXT,
  todoist_project_id    TEXT,
  todoist_project_nom   TEXT
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

CREATE TABLE IF NOT EXISTS jd_notes (
  id              SERIAL PRIMARY KEY,
  workspace_id    INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('journal', 'documentation')),
  nature          TEXT CHECK (nature IN ('observation', 'activite')),
  theme_id        INTEGER REFERENCES jd_themes(id),
  titre           TEXT,
  titre_alt       TEXT,
  contenu         TEXT,
  date            DATE,
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  tache_todoist_id              TEXT,
  tache_todoist_due             TEXT,
  tache_todoist_priority        INTEGER,
  tache_todoist_done            BOOLEAN DEFAULT FALSE,
  tache_todoist_recurrence_done BOOLEAN DEFAULT FALSE,
  tache_todoist_consigne        TEXT,
  tache_todoist_content         TEXT
);

CREATE TABLE IF NOT EXISTS jd_note_objet (
  note_id  INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  objet_id INTEGER REFERENCES jd_objets(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, objet_id)
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
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jd_note_media (
  note_id  INTEGER REFERENCES jd_notes(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES jd_medias(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, media_id)
);

-- ─────────────────────────────────────────────
-- Index utiles
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jd_notes_workspace  ON jd_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_date       ON jd_notes(date);
CREATE INDEX IF NOT EXISTS idx_jd_notes_theme      ON jd_notes(theme_id);
CREATE INDEX IF NOT EXISTS idx_jd_objets_workspace ON jd_objets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_themes_workspace ON jd_themes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_medias_workspace ON jd_medias(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_elements_ws      ON jd_elements(workspace_id);
