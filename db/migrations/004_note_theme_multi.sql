-- 004 — Thèmes multiples par note (calqué sur jd_note_objet)
-- jd_notes.theme_id est CONSERVÉ (legacy / compat) et alimenté avec le 1er thème.

CREATE TABLE IF NOT EXISTS jd_note_theme (
  note_id  INTEGER REFERENCES jd_notes(id)  ON DELETE CASCADE,
  theme_id INTEGER REFERENCES jd_themes(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, theme_id)
);

-- Reprise des liaisons existantes
INSERT INTO jd_note_theme (note_id, theme_id)
SELECT id, theme_id FROM jd_notes WHERE theme_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_jd_note_theme_theme ON jd_note_theme(theme_id);
