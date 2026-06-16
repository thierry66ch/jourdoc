-- Convertit tache_todoist_consigne de TEXT en BOOLEAN
ALTER TABLE jd_notes
  ALTER COLUMN tache_todoist_consigne TYPE BOOLEAN
  USING (tache_todoist_consigne IN ('true', '1', 'TRUE'));
