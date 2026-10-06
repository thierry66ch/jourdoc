-- 013 — Horodatage du dernier sync Todoist par workspace.
-- Permet de n'examiner que les complétions Todoist survenues DEPUIS le dernier
-- sync (endpoint tasks/completed/by_completion_date) et donc de distinguer une
-- occurrence récurrente réellement accomplie d'un simple report de date (qui
-- n'apparaît pas dans les complétions).
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS todoist_synced_at TIMESTAMPTZ;
