# API REST — pogil-apps

Base URL : `/api`. Toutes les routes JourDoc nécessitent `Authorization: Bearer <token>`.

## Auth utilisateur

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | `{ identifier, password }` → `{ token }` |
| POST | `/auth/logout` | — | Stateless, client supprime le token |
| GET | `/auth/me` | Bearer | Profil utilisateur |

## Portail

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/me/apps` | Bearer | Apps accessibles à l'utilisateur |
| GET | `/me/apps/:slug/workspaces` | Bearer | Workspaces de l'app |

## Admin (Bearer adminToken)

| Méthode | Route | Description |
|---|---|---|
| POST | `/admin/login` | Étape 1 : mot de passe → envoi OTP email |
| POST | `/admin/verify-otp` | Étape 2 : OTP → `{ token }` admin (4h) |
| GET | `/admin/users` | Liste utilisateurs |
| POST | `/admin/users` | Créer utilisateur |
| PUT | `/admin/users/:id` | Modifier utilisateur |
| DELETE | `/admin/users/:id` | Supprimer utilisateur |
| PUT | `/admin/users/:id/access` | Droits app/workspace |
| POST | `/admin/settings/request-otp` | OTP pour changement d'identifiants |
| POST | `/admin/settings/confirm` | Confirmer avec OTP |

---

## JourDoc (`/api/jourdoc/...`)

Toutes les routes `:wsId/*` passent par le middleware `wsCheck` (vérifie `user_workspace_access`).

### Workspaces

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/workspaces` | Liste workspaces de l'utilisateur |
| POST | `/jourdoc/workspaces` | Créer workspace |
| GET | `/jourdoc/:wsId` | Détails workspace |
| PATCH | `/jourdoc/:wsId` | Renommer (owner) |
| DELETE | `/jourdoc/:wsId` | Supprimer + cascade (owner) |
| GET | `/jourdoc/:wsId/members` | Membres |
| POST | `/jourdoc/:wsId/members` | Inviter membre |
| PUT | `/jourdoc/:wsId/members/:uid` | Changer rôle |
| DELETE | `/jourdoc/:wsId/members/:uid` | Retirer membre |

### Objets

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/objets` | Liste tous les objets |
| POST | `/jourdoc/:wsId/objets` | Créer objet |
| PUT | `/jourdoc/:wsId/objets/:id` | Modifier (nom, parent, nom_court, etc.) |
| DELETE | `/jourdoc/:wsId/objets/:id` | Supprimer |
| GET | `/jourdoc/:wsId/objets/:id/notes` | Notes avec filtre hiérarchique SQL CTE — `?direction=both\|down\|up` |
| POST | `/jourdoc/:wsId/import/objets` | Import CSV objets |

### Thèmes

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/themes` | Liste tous les thèmes |
| POST | `/jourdoc/:wsId/themes` | Créer thème |
| PUT | `/jourdoc/:wsId/themes/:id` | Modifier |
| DELETE | `/jourdoc/:wsId/themes/:id` | Supprimer |
| GET | `/jourdoc/:wsId/themes/:id/notes` | Notes avec filtre hiérarchique JS — `?direction=both\|down\|up` |
| POST | `/jourdoc/:wsId/import/themes` | Import CSV thèmes |

### Notes

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/notes` | Liste avec filtres : `?type=` `?nature=` `?date_from=` `?date_to=` `?objet_id=` `?theme_id=` |
| POST | `/jourdoc/:wsId/notes` | Créer note (avec `objet_ids[]`, `media_ids[]`) |
| GET | `/jourdoc/:wsId/notes/search` | Recherche plein-texte `?q=` (pour NoteLinkPicker) |
| GET | `/jourdoc/:wsId/notes/:id` | Détail note avec objets, médias, liens entrants/sortants |
| PUT | `/jourdoc/:wsId/notes/:id` | Modifier note |
| DELETE | `/jourdoc/:wsId/notes/:id` | Supprimer |
| POST | `/jourdoc/:wsId/notes/:id/liens` | Créer lien note→note |
| DELETE | `/jourdoc/:wsId/notes/:id/liens/:cibleId` | Supprimer lien |

### Médias

| Méthode | Route | Description |
|---|---|---|
| POST | `/jourdoc/:wsId/medias` | Upload fichiers (multipart) — traitement EXIF+resize+HEIC |
| GET | `/jourdoc/:wsId/medias` | Liste avec filtres `?date_from=` `?date_to=` `?type_media=` `?lie=` |
| DELETE | `/jourdoc/:wsId/medias/:id` | Supprimer fichier + DB |
| GET | `/jourdoc/:wsId/medias/:id/notes` | Notes liées à un média |
| PUT | `/jourdoc/:wsId/notes/:id/medias` | Mettre à jour médias d'une note |

### Todoist — workspace

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/todoist` | Config + `last_sync_at` |
| PUT | `/jourdoc/:wsId/todoist` | Sauvegarder token + projet |
| POST | `/jourdoc/:wsId/todoist/projects` | Tester token et lister projets |
| POST | `/jourdoc/:wsId/todoist/sync` | Sync batch des tâches non complétées → `{ ok, synced, completed, errors }` |
| GET | `/jourdoc/:wsId/todoist/tasks` | Toutes les notes avec tâche liée (done + recurrence + consigne) |

### Todoist — note

| Méthode | Route | Description |
|---|---|---|
| POST | `/jourdoc/:wsId/notes/:id/todoist` | Créer tâche Todoist → `{ task_id, url }` |
| POST | `/jourdoc/:wsId/notes/:id/todoist/link` | Lier tâche existante via URL/ID Todoist |
| GET | `/jourdoc/:wsId/notes/:id/todoist` | Statut tâche (polling) → `{ linked, completed, content, due, priority... }` |
| POST | `/jourdoc/:wsId/notes/:id/todoist/close` | Terminer la tâche dans Todoist |
| DELETE | `/jourdoc/:wsId/notes/:id/todoist` | Délier (et optionnellement supprimer dans Todoist) |
| GET | `/jourdoc/:wsId/notes/:id/todoist/details` | Détails complets : `{ completed_at, task_content, task_id, comments[] }` |
| POST | `/jourdoc/:wsId/notes/:id/todoist/import` | Importer résolution dans la note (ajoute HTML : date + lien tâche + commentaires) |

### Analyse pluriannuelle

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/analyse` | Notes filtrées pour vue comparative — params : `objet_id`, `objet_dir`, `theme_id`, `theme_dir`, `nature` |

Retourne `{ notes: [{ id, date, nature, type, titre_alt, titre, theme_nom }] }`.
La documentation exclut les notes avec `nature IS NULL` (documentation intemporelle).
