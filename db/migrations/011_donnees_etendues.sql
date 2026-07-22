-- 011 — Données étendues (Phase A) — JourDoc V2.1
--
-- Champ JSON libre par note : paires clé/valeur saisies manuellement.
-- Le stockage est un OBJET { "cle": "valeur" } — c'est déjà la forme attendue par la
-- Phase B (schémas contextuels), où les clés viendront de la définition du schéma.
-- Les clés saisies en Phase A deviendront naturellement des valeurs « hors schéma ».
--
-- Pas de contrainte de structure : aucune validation en Phase A (assumé).

ALTER TABLE jd_notes ADD COLUMN IF NOT EXISTS donnees_etendues jsonb;
