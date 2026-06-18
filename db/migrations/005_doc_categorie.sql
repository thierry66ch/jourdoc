-- 005 — Catégories de documentation (sous-natures ouvertes par workspace)
-- Le journal garde nature (observation/activite). La documentation reçoit une
-- catégorie gérable : référentiel jd_doc_categorie + FK doc_categorie_id.

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

ALTER TABLE jd_notes
  ADD COLUMN IF NOT EXISTS doc_categorie_id INTEGER REFERENCES jd_doc_categorie(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jd_doc_categorie_ws   ON jd_doc_categorie(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_doc_categorie ON jd_notes(doc_categorie_id);

-- Seed des catégories par défaut pour les workspaces existants
INSERT INTO jd_doc_categorie (workspace_id, nom, icon, couleur, ordre)
SELECT w.id, d.nom, d.icon, d.couleur, d.ordre
FROM workspaces w
CROSS JOIN (VALUES
  ('Conseil',    '💡', '#f59e0b', 1),
  ('Descriptif', '📋', '#0ea5e9', 2),
  ('Manuel',     '📖', '#8b5cf6', 3),
  ('Norme',      '📐', '#ef4444', 4),
  ('Exemple',    '✨', '#10b981', 5)
) AS d(nom, icon, couleur, ordre)
ON CONFLICT (workspace_id, nom) DO NOTHING;
