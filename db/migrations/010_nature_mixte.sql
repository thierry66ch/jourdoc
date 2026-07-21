-- 010 — Nature mixte « Observ.→Activité » pour les notes de journal.
--
-- Une note de nature 'mixte' apparaît à la fois dans les listes filtrées des
-- Observations ET des Activités (côté serveur : nature IN (filtre, 'mixte')).
-- Pas de filtre dédié « mixte seul » (sans intérêt).

ALTER TABLE jd_notes DROP CONSTRAINT IF EXISTS jd_notes_nature_check;
ALTER TABLE jd_notes ADD  CONSTRAINT jd_notes_nature_check
  CHECK (nature IN ('observation', 'activite', 'mixte'));
