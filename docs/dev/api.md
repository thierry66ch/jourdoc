# API REST — JourDoc V2

Base : `/api`. Routes montées dans `server/app.js` (cf. `architecture.md`).
Toutes les routes JourDoc nécessitent `Authorization: Bearer <token>`
(ou `?t=<token>` pour les ressources chargées en `<img>`/`<iframe>`).

## Auth utilisateur (`/api/auth`)

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | `{ identifier, password }` → `{ token }` |
| POST | `/auth/logout` | — | Stateless |
| POST | `/auth/forgot-password` | — | `{ email }` → envoie un lien de réinitialisation |
| POST | `/auth/reset-password` | — | `{ token, password }` |

## Portail (`/api/me`)

| Méthode | Route | Description |
|---|---|---|
| GET | `/me/apps` | Apps accessibles à l'utilisateur |
| GET | `/me/apps/:slug/workspaces` | Workspaces de l'app |

> Monté sur `/api/me` (et **non** `/api`) pour éviter les collisions de routes.

## Admin (`/api/admin`, Bearer admin)

| Méthode | Route | Description |
|---|---|---|
| POST | `/admin/login` | Étape 1 : mot de passe → OTP email |
| POST | `/admin/verify-otp` | Étape 2 : OTP → token admin |
| GET / POST | `/admin/users` | Lister / créer |
| PUT / DELETE | `/admin/users/:id` | Modifier / supprimer |
| PUT | `/admin/users/:id/access` | Droits app/workspace |
| POST | `/admin/settings/request-otp` | OTP changement identifiants |
| POST | `/admin/settings/confirm` | Confirmer (`newEmail` / `newPassword`) |

---

## JourDoc (`/api/jourdoc`)

Les routes `:wsId/*` passent par `wsCheck` (vérifie `user_workspace_access`).

### Workspaces & réglages

| Méthode | Route | Description |
|---|---|---|
| GET / POST | `/jourdoc/workspaces` | Lister / créer |
| GET | `/jourdoc/:wsId` | Détails + `search_depth`, `picker_mode_mobile/desktop` |
| PATCH / DELETE | `/jourdoc/:wsId` | Renommer / supprimer (owner) |
| GET/POST/PUT/DELETE | `/jourdoc/:wsId/members[/:uid]` | Gestion des membres |
| PATCH | `/jourdoc/:wsId/search-depth` | `{ depth }` (1–10) |
| PATCH | `/jourdoc/:wsId/picker-mode` | `{ platform: 'mobile'\|'desktop', mode: 'filter'\|'scroll' }` |
| GET | `/jourdoc/:wsId/export?format=json\|csv&medias=0\|1` | Export workspace (voir plus bas) |

### Objets / Thèmes (hiérarchies)

| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/jourdoc/:wsId/objets` | Lister / créer |
| PUT/DELETE | `/jourdoc/:wsId/objets/:id` | Modifier / supprimer |
| GET | `/jourdoc/:wsId/objets/:id/notes?direction=both\|down\|up` | Notes (filtre hiérarchique) |
| GET/POST | `/jourdoc/:wsId/themes` | Lister / créer |
| PUT/DELETE | `/jourdoc/:wsId/themes/:id` | Modifier / supprimer |
| GET | `/jourdoc/:wsId/themes/:id/notes?direction=` | Notes (EXISTS sur `jd_note_theme`) |
| POST | `/jourdoc/:wsId/import/objets` \| `/import/themes` | Import CSV |

### Éléments (étiquettes plates)

| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/jourdoc/:wsId/elements` | Lister / créer (création inline) |
| PUT/DELETE | `/jourdoc/:wsId/elements/:id` | Renommer / supprimer |
| POST | `/jourdoc/:wsId/elements/merge` | Fusionner deux éléments |

### Notes

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/notes` | Liste filtrée : `?type= &nature= &date_from= &date_to= &objet_id= &theme_id=` |
| POST | `/jourdoc/:wsId/notes` | Créer — body `theme_ids[]`, `objet_ids[]`, `element_ids[]`, `media_ids[]` |
| GET | `/jourdoc/:wsId/notes/search?q=` | Recherche titre (NoteLinkPicker) |
| GET | `/jourdoc/:wsId/notes/:id` | Détail : `objets[]`, `themes[]`, `elements[]`, `medias[]`, liens entrants/sortants |
| PUT | `/jourdoc/:wsId/notes/:id` | Modifier |
| DELETE | `/jourdoc/:wsId/notes/:id` | Supprimer |
| POST | `/jourdoc/:wsId/notes/:id/liens` | Lien note→note |
| DELETE | `/jourdoc/:wsId/notes/:id/liens/:cibleId` | Supprimer lien |

> **Thèmes multiples** : à l'écriture, le serveur accepte `theme_ids[]` (repli sur
> `theme_id` legacy) ; il alimente `jd_note_theme` et copie le 1er thème dans
> `jd_notes.theme_id`. En lecture, les notes exposent un tableau `themes[]`.

### Médias

| Méthode | Route | Description |
|---|---|---|
| POST | `/jourdoc/:wsId/medias` | Upload multipart → EXIF + HEIC→JPEG + resize → WebDAV |
| GET | `/jourdoc/:wsId/medias` | Liste filtrée `?date_from= &date_to= &type_media= &lie=` |
| GET | `/jourdoc/:wsId/medias/:id/file` | **Proxy WebDAV** (sert le binaire ; accepte `?t=`) |
| DELETE | `/jourdoc/:wsId/medias/:id` | Supprimer fichier + DB |
| GET | `/jourdoc/:wsId/medias/:id/notes` | Notes liées à un média |
| GET/PUT | `/jourdoc/:wsId/notes/:id/medias` | Médias d'une note |

### Inbox (routes `inboxRoutes`, même préfixe `/api/jourdoc`)

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/inbox` | Liste les fichiers de l'inbox WebDAV |
| POST | `/jourdoc/:wsId/inbox/scan` | Importe les fichiers de l'inbox (sans conversion) |

### Todoist — workspace

| Méthode | Route | Description |
|---|---|---|
| GET/PUT | `/jourdoc/:wsId/todoist` | Config + `last_sync_at` |
| POST | `/jourdoc/:wsId/todoist/projects` | Tester token + lister projets |
| POST | `/jourdoc/:wsId/todoist/sync` | Sync batch → `{ ok, synced, completed, errors }` |
| GET | `/jourdoc/:wsId/todoist/tasks` | Notes avec tâche liée (+ `objets[]`, `themes[]`) |

### Todoist — note

| Méthode | Route | Description |
|---|---|---|
| POST | `/jourdoc/:wsId/notes/:id/todoist` | Créer tâche → `{ task_id, url }` |
| POST | `/jourdoc/:wsId/notes/:id/todoist/link` | Lier une tâche existante (URL/ID) |
| GET | `/jourdoc/:wsId/notes/:id/todoist` | Statut (polling) |
| POST | `/jourdoc/:wsId/notes/:id/todoist/close` | Terminer la tâche |
| DELETE | `/jourdoc/:wsId/notes/:id/todoist` | Délier |
| GET | `/jourdoc/:wsId/notes/:id/todoist/details` | Détails + commentaires |
| POST | `/jourdoc/:wsId/notes/:id/todoist/import` | Consigner la résolution dans la note |

### Analyse pluriannuelle

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/analyse` | `?objet_id= &objet_dir= &theme_id= &theme_dir= &nature=` |

Filtre thème via `EXISTS (jd_note_theme)`. Exclut les notes `nature IS NULL`
(documentation intemporelle).

## Export workspace

`GET /:wsId/export?format=json|csv&medias=0|1`

- **JSON** : `{ workspace, objets, themes, elements, notes, medias }` ; chaque note
  embarque `objets[]`, `themes[]`, `elements[]`, `medias[]`, `liens[]`.
- **CSV (ZIP)** : référentiels `objets.csv`, `themes.csv`, `elements.csv`, `notes.csv`,
  `medias.csv` + liaisons `note_objets.csv`, `note_themes.csv`, `note_elements.csv`,
  `note_medias.csv`, `liens_notes.csv`. Avec `medias=1`, les fichiers binaires
  (récupérés depuis WebDAV) sont inclus dans le ZIP.

> Référence des constantes de routes côté front : `packages/shared/src/index.js`
> (objet `API_ROUTES`).
