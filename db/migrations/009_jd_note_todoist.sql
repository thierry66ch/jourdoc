-- 009 — Plusieurs tâches Todoist par note
--
-- Source de vérité : table de liaison jd_note_todoist (N tâches par note).
-- Les colonnes jd_notes.tache_todoist_* sont CONSERVÉES et réaffectées en CACHE de la
-- tâche « la plus urgente » de la note (badge NoteCard + requêtes de liste inchangées,
-- cf. refreshNoteTaskCache dans server/routes/jourdoc.js).
--
-- urgence = 2 + P + D  (P = priorité API 1–4 ; D = bucket de délai, cf. computeUrgence).
-- Tri page Tâches & choix de la tâche-cache : urgence décroissante (plus urgent en haut).

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
  urgence         INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (note_id, todoist_id)
);

CREATE INDEX IF NOT EXISTS idx_jd_note_todoist_note ON jd_note_todoist(note_id);
CREATE INDEX IF NOT EXISTS idx_jd_note_todoist_ws   ON jd_note_todoist(workspace_id);

-- Migration des liens 1:1 existants vers la table (1 ligne par note ayant une tâche).
INSERT INTO jd_note_todoist (note_id, workspace_id, todoist_id, content, due, priority, done, recurrence_done, consigne)
SELECT id, workspace_id, tache_todoist_id, tache_todoist_content, tache_todoist_due, tache_todoist_priority,
       COALESCE(tache_todoist_done, FALSE), COALESCE(tache_todoist_recurrence_done, FALSE), COALESCE(tache_todoist_consigne, FALSE)
FROM jd_notes
WHERE tache_todoist_id IS NOT NULL
ON CONFLICT (note_id, todoist_id) DO NOTHING;

-- urgence : recalculée par l'application (computeUrgence) au moment de l'application.
