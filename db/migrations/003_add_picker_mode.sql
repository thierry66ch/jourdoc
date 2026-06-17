-- 003 — Mode d'affichage du HierarchyPicker (sélecteurs objets/thèmes)
-- 'scroll' = défile jusqu'à la 1ère correspondance (comportement historique)
-- 'filter' = réduit la liste aux seuls éléments correspondants
-- Réglage distinct mobile / desktop par workspace.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS jd_picker_mode_mobile  TEXT DEFAULT 'filter',
  ADD COLUMN IF NOT EXISTS jd_picker_mode_desktop TEXT DEFAULT 'scroll';
