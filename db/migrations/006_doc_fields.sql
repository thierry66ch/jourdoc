-- 006 — Champs enrichis pour les notes de documentation
--   doc_auteur     : auteur / source (texte libre)
--   doc_statut     : 'brouillon' | 'valide' | 'obsolete' (NULL = non défini)
--   doc_reference  : date de référence / version (texte libre, ex. « éd. 2024 », « v2.1 »)
-- Pertinents uniquement pour les notes de type 'documentation'.

ALTER TABLE jd_notes
  ADD COLUMN IF NOT EXISTS doc_auteur    TEXT,
  ADD COLUMN IF NOT EXISTS doc_statut    TEXT,
  ADD COLUMN IF NOT EXISTS doc_reference TEXT;
