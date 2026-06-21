-- 007 — Statuts de documentation gérables par workspace (référentiel)
-- Remplace la colonne texte jd_notes.doc_statut par un FK vers jd_doc_statut.

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

-- Statuts par défaut pour les workspaces existants
INSERT INTO jd_doc_statut (workspace_id, nom, icon, couleur, ordre)
SELECT w.id, d.nom, d.icon, d.couleur, d.ordre
FROM workspaces w
CROSS JOIN (VALUES
  ('Brouillon', '✏️', '#94a3b8', 1),
  ('Validé',    '✅', '#10b981', 2),
  ('Obsolète',  '⚠️', '#ef4444', 3)
) AS d(nom, icon, couleur, ordre)
ON CONFLICT (workspace_id, nom) DO NOTHING;

ALTER TABLE jd_notes
  ADD COLUMN IF NOT EXISTS doc_statut_id INTEGER REFERENCES jd_doc_statut(id) ON DELETE SET NULL;

-- Reprise des valeurs texte existantes → id du référentiel
UPDATE jd_notes n SET doc_statut_id = ds.id
FROM jd_doc_statut ds
WHERE ds.workspace_id = n.workspace_id
  AND n.doc_statut IS NOT NULL
  AND ds.nom = CASE n.doc_statut
      WHEN 'brouillon' THEN 'Brouillon'
      WHEN 'valide'    THEN 'Validé'
      WHEN 'obsolete'  THEN 'Obsolète'
      ELSE NULL END;

ALTER TABLE jd_notes DROP COLUMN IF EXISTS doc_statut;

CREATE INDEX IF NOT EXISTS idx_jd_doc_statut_ws    ON jd_doc_statut(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_doc_statut ON jd_notes(doc_statut_id);
