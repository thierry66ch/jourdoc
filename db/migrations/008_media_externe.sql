-- 008 — Pièces jointes « liées » (référence externe)
-- externe = TRUE → le fichier vit hors de JourDoc (dossier WEBDAV_PATH_EXTDOCS) ;
-- au détachement/suppression de la pièce jointe, l'original n'est PAS supprimé.

ALTER TABLE jd_medias
  ADD COLUMN IF NOT EXISTS externe BOOLEAN DEFAULT FALSE;
