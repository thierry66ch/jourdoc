# Base de données — JourDoc / pogil-apps

SQLite via `node:sqlite` (Node.js ≥ 22.5), mode WAL, foreign keys activées.
Fichier : `data/pogil.db` (gitignored). Chemin configurable via `DB_PATH`.

## Schéma initial (`server/db/schema.sql`)

```
users ──< user_app_access >── apps
users ──< user_workspace_access >── workspaces ──< jd_objets (auto-ref)
                                                ──< jd_themes (auto-ref)
                                                ──< jd_notes ──< jd_note_objet >── jd_objets
                                                             ──< jd_note_note (auto-ref)
                                                             ──< jd_note_media >── jd_medias
admin ──< otp_attempts
```

## Tables — Portail

### `users`
| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `username` | TEXT UNIQUE | |
| `email` | TEXT UNIQUE | |
| `password_hash` | TEXT | bcryptjs |
| `is_active` | BOOLEAN | default TRUE |
| `created_at` | DATETIME | |

### `apps`
| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `slug` | TEXT UNIQUE | ex. `jourdoc` |
| `name` | TEXT | |
| `icon` | TEXT | emoji ou URL |
| `is_active` | BOOLEAN | |

### `workspaces`
| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `app_id` | → `apps.id` | CASCADE DELETE |
| `name` | TEXT | |
| `created_by` | → `users.id` | |
| `created_at` | DATETIME | |
| `todoist_token` | TEXT | chiffré en clair, migration |
| `todoist_project_id` | TEXT | migration |
| `todoist_project_nom` | TEXT | migration |

### `user_workspace_access`
| Colonne | Type | Notes |
|---|---|---|
| `user_id` | → `users.id` | PK composite |
| `workspace_id` | → `workspaces.id` | PK composite |
| `role` | TEXT | `'owner'` \| `'member'` |

### `admin` + `otp_attempts`
Compte admin unique avec OTP email (2-step login). `otp_code` + `otp_expires` sur l'admin.

---

## Tables — JourDoc

### `jd_objets`
| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `workspace_id` | → `workspaces.id` | CASCADE |
| `parent_id` | → `jd_objets.id` | NULL = racine, SET NULL si parent supprimé |
| `nom` | TEXT | |
| `nom_court` | TEXT | abréviation pour `titre_alt` |
| `est_individu` | BOOLEAN | 0 = groupe, 1 = individu (feuille) |
| `description` | TEXT | |
| `created_at` | DATETIME | |

### `jd_themes`
| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `workspace_id` | → `workspaces.id` | CASCADE |
| `parent_id` | → `jd_themes.id` | NULL = racine |
| `nom` | TEXT | |
| `nom_court` | TEXT | |
| `created_at` | DATETIME | |

### `jd_notes`
| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `workspace_id` | → `workspaces.id` | CASCADE |
| `type` | TEXT CHECK | `'journal'` \| `'documentation'` |
| `nature` | TEXT CHECK | `'observation'` \| `'activite'` \| NULL (documentation) |
| `theme_id` | → `jd_themes.id` | SET NULL |
| `titre` | TEXT | obligatoire, auto-générable |
| `titre_alt` | TEXT | version courte (noms_courts) |
| `contenu` | TEXT | HTML (Tiptap) |
| `date` | TEXT | ISO YYYY-MM-DD (NULL pour documentation) |
| `source_url` | TEXT | pour documentation |
| `tache_todoist_id` | TEXT | ID tâche Todoist (migration) |
| `tache_todoist_due` | TEXT | date échéance cache (migration) |
| `tache_todoist_priority` | INTEGER | 1–4 Todoist (migration) |
| `tache_todoist_done` | INTEGER | 0/1 (migration) |
| `tache_todoist_recurrence_done` | INTEGER | 0/1 — occurrence récurrente exécutée (migration) |
| `tache_todoist_consigne` | INTEGER | 0/1 — résolution consignée dans la note (migration) |
| `tache_todoist_content` | TEXT | titre de la tâche Todoist (migration) |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | trigger auto |

### Tables de liaison

| Table | Colonnes | Notes |
|---|---|---|
| `jd_note_objet` | `note_id` + `objet_id` | N-N, PK composite |
| `jd_note_note` | `note_source_id` + `note_cible_id` + `type_lien` | fil documentaire |
| `jd_note_media` | `note_id` + `media_id` | N-N |

### `jd_medias`
| Colonne | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `workspace_id` | → `workspaces.id` | CASCADE |
| `fichier` | TEXT | chemin relatif `uploads/<uuid>.<ext>` |
| `nom_original` | TEXT | nom du fichier d'origine |
| `type_media` | TEXT CHECK | `'photo'` \| `'capture'` \| `'pdf'` |
| `mime_type` | TEXT | |
| `taille` | INTEGER | octets |
| `date_prise` | TEXT | EXIF ou date upload |
| `lie` | BOOLEAN | false = non lié à une note |
| `created_at` | DATETIME | |

---

## Migrations (`server/db/db.js`)

Les colonnes ajoutées après le déploiement initial sont dans un loop `try/catch` idempotent dans `db.js` :

```js
// workspaces
['todoist_token TEXT', 'todoist_project_id TEXT', 'todoist_project_nom TEXT']

// jd_notes
['tache_todoist_due TEXT', 'tache_todoist_priority INTEGER',
 'tache_todoist_done INTEGER DEFAULT 0',
 'tache_todoist_recurrence_done INTEGER DEFAULT 0',
 'tache_todoist_consigne INTEGER DEFAULT 0',
 'tache_todoist_content TEXT']
```

**Convention** : toute nouvelle colonne → ajouter dans le loop de `db.js`, jamais dans `schema.sql` (qui ne s'exécute que si la table n'existe pas).

---

## Index

```sql
idx_jd_objets_ws, idx_jd_objets_parent
idx_jd_themes_ws
idx_jd_notes_ws, idx_jd_notes_date
idx_jd_no_note, idx_jd_no_objet
idx_jd_medias_ws, idx_jd_medias_date, idx_jd_medias_lie
idx_jd_nm_note, idx_jd_nm_media
```
