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
| GET | `/jourdoc/:wsId/export/facets` | Années journal + compteurs (sélecteur d'export) |
| GET | `/jourdoc/:wsId/export/manifest?type=&year=` | Manifeste léger pour l'export complet côté navigateur |
| POST | `/jourdoc/:wsId/export/manifest` | Manifeste d'une **liste filtrée** : body `{ ids:[…] }` (évite une URL trop longue). Même forme que le GET, notes filtrées par ces ids. Expose aussi `created_at` (tri doc), `titre_alt`, `donnees` (données étendues mises en forme), `donnees_brut` (clé→valeur, pour le CSV) et `champsDonnees` (clé→{label,type,unite,max} agrégé des schémas). Helper serveur `buildExportManifest` partagé |

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

### Catégories (unifiées journal + documentation — migration 014)

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/categories` | Liste complète (ordonnée, actives et inactives) : `id, nom, nom_court, icon, couleur, ordre, actif, applique_observation, applique_activite, applique_documentation, nature_defaut` + `note_count` |
| POST | `/jourdoc/:wsId/categories` | Créer `{ nom, nom_court?, icon?, couleur?, applique_*?, nature_defaut?, actif? }` — `400` si portée vide ou `nature_defaut` incompatible |
| PUT | `/jourdoc/:wsId/categories/:id` | Modifier (mêmes champs + `ordre?`) — `409` si nom pris |
| POST | `/jourdoc/:wsId/categories/reorder` | `{ ids: [...] }` → `ordre` = position |
| DELETE | `/jourdoc/:wsId/categories/:id` | Supprimer — `409` si portée par des notes (désactiver plutôt) |
| POST | `/jourdoc/:wsId/import/categories` | Import CSV `{ csv }` (format `categories.csv` : `nom;emoji;couleur;applique_observation;applique_activite;applique_documentation;nature_defaut;ordre`) — upsert par nom |
| GET | `/jourdoc/:wsId/doc-categories` | **Compat** anciens clients : catégories actives de portée documentation |

Notes : `POST/PUT /notes` acceptent **`categorie_ids`** (tableau **ordonné**, journal et
documentation). L'ancien `doc_categorie_id` reste accepté en repli (traduit via
`origine_doc_categorie_id`). Les notes renvoyées portent **`categories`** (ordonnées) et un
alias `doc_categorie` = la 1re. `GET /notes?categorie_id=1,2` et
`GET /analyse?categorie_ids=1,2` filtrent sur « au moins une ». Logique dans
`server/lib/categories.js`.
| GET/POST/PUT/DELETE | `/jourdoc/:wsId/doc-statuts[/:id]` | Référentiel des statuts de doc (même schéma que les catégories) |

### Schémas de données étendues (V2.1)

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/schemas-donnees` | Liste des schémas (+ noms de contexte, `notes_count`) |
| POST | `/jourdoc/:wsId/schemas-donnees` | Créer `{ nom, objet_id?, theme_id?, categorie_id?, nature?, champs[], actif }` — `409` si le contexte est déjà pris (contrainte unique) **ou** si une `cle` existe ailleurs dans le workspace avec un type / des options / une unité / une échelle différents (validateur `conflitCles`, condition de la fusion). Recalcule le cache `schema_donnees_ids` des notes |
| PUT | `/jourdoc/:wsId/schemas-donnees/:id` | Modifier (mêmes champs, mêmes `409`) |
| DELETE | `/jourdoc/:wsId/schemas-donnees/:id` | Supprimer (les données déjà saisies restent, deviennent « hors schéma ») |
| GET | `/jourdoc/:wsId/schemas-donnees/resolve?objet_id=&theme_id=&categorie_ids=1,2&nature=` | **Résout et fusionne** les schémas applicables → `{ schema: { id, nom, champs[], schemas[] } }` ou `{ schema: null }` (chaque champ porte `_schema`, l'id du schéma d'origine). Déclaré **avant** `/:id`. Utilisé par l'éditeur de note en direct et le simulateur |

> **Résolution** (`pickSchema`, `server/lib/categories.js`, en mémoire) : parmi les schémas dont chaque axe non-joker
> matche (objet/thème via **chaîne d'ancêtres**, profondeur du workspace),
> tri par **spécificité** (nb d'axes non-joker) ↓, puis **distance d'ancêtre** ↑ *(uniquement
> pour les schémas à axe hiérarchique — un schéma nature/catégorie seul a une distance ∞ pour
> ne pas gagner indûment)*, puis **priorité** objet > thème > (catégorie|nature). Une note
> `mixte` est matchée par les schémas `observation`/`activite`.
>
> **Fusion** (`fusionSchemas`) : une résolution **par catégorie** de la note (dans l'ordre),
> repli sur le joker (`categorie_id NULL`) si aucune ne résout ; union des champs
> **dédupliqués par `cle`** (1re occurrence = position). Mono-catégorie = comportement
> d'avant. Cache : `jd_notes.schema_donnees_ids` (+ `schema_donnees_id` = le 1er, compat),
> recalculé au POST/PUT de note et à toute modification de schéma (`recalcSchemasNotes`).
> La fiche (`GET /notes/:id`) recalcule la fusion à la lecture.

### Notes

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/notes` | Liste filtrée : `?type= &nature= &date_from= &date_to= &objet_id= &theme_id=`. `nature=observation\|activite` inclut aussi les notes `mixte` (`nature IN (filtre,'mixte')`) |
| POST | `/jourdoc/:wsId/notes` | Créer — body `theme_ids[]`, `objet_ids[]`, `element_ids[]`, `media_ids[]`, `doc_categorie_id` (documentation), `donnees_etendues` (objet `{cle:valeur}`), `objet_principal_id` (déf. = 1er objet). Cache de schéma recalculé |
| GET | `/jourdoc/:wsId/notes/search?q=` | Recherche titre (NoteLinkPicker) |
| GET | `/jourdoc/:wsId/notes/:id` | Détail : `objets[]`, `themes[]`, `elements[]`, `medias[]`, `doc_categorie`, liens entrants/sortants |
| PUT | `/jourdoc/:wsId/notes/:id` | Modifier. `donnees_etendues` mis à jour **seulement s'il est présent** dans le body (pas d'écrasement sinon) ; `objet_principal_id` recalculé ; cache de schéma recalculé |
| DELETE | `/jourdoc/:wsId/notes/:id` | Supprimer |
| POST | `/jourdoc/:wsId/notes/:id/liens` | Lien note→note |
| DELETE | `/jourdoc/:wsId/notes/:id/liens/:cibleId` | Supprimer lien |

> **Thèmes multiples** : à l'écriture, le serveur accepte `theme_ids[]` (repli sur
> `theme_id` legacy) ; il alimente `jd_note_theme` et copie le 1er thème dans
> `jd_notes.theme_id`. En lecture, les notes exposent un tableau `themes[]`.

### Médias

| Méthode | Route | Description |
|---|---|---|
| POST | `/jourdoc/:wsId/medias` | Upload multipart → EXIF + HEIC→JPEG + resize → WebDAV (accepte aussi `.md`). Champ `dates[]` **aligné sur `files[]`** = date EXIF lue côté client **avant** resize (le re-encodage efface l'EXIF) ; repli après l'EXIF serveur. `date_prise` = repli global |
| POST | `/jourdoc/:wsId/medias/markdown` | Créer un document Markdown `{ nom, content }` → média `type_media='markdown'` |
| GET | `/jourdoc/:wsId/medias/:id/content` | Lire le texte d'un markdown → `{ content, nom_original, base, externe }` |
| GET | `/jourdoc/:wsId/extdocs/tree?path=` | Arborescence du dossier externe (`WEBDAV_PATH_EXTDOCS`) → `{ path, entries:[{name,dir}] }` |
| POST | `/jourdoc/:wsId/medias/link` | Lier un fichier externe `{ path }` (référence, sans copie ; `externe=true`) |
| GET | `/jourdoc/:wsId/extdocs/file?path=&t=` | Proxy d'un fichier sous EXTDOCS (images relatives des MD liés) |
| PUT | `/jourdoc/:wsId/medias/:id/content` | Réenregistrer le texte `{ content, nom }` sur WebDAV |
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

Modèle **N tâches par note** : table `jd_note_todoist` (source de vérité) ; les colonnes
`jd_notes.tache_todoist_*` = cache de la tâche **la plus urgente** (badge + listes).
`urgence = 2 + priorité + bucket de délai` (D sans date = 3 ; cf. `computeUrgence`).

| Méthode | Route | Description |
|---|---|---|
| GET/PUT | `/jourdoc/:wsId/todoist` | Config + `last_sync_at` |
| POST | `/jourdoc/:wsId/todoist/projects` | Tester token + lister projets |
| POST | `/jourdoc/:wsId/todoist/sync` | Sync batch (boucle sur `jd_note_todoist`) → `{ ok, synced, completed, errors }` |
| GET | `/jourdoc/:wsId/todoist/tasks` | **1 ligne/tâche** triée par urgence ↓ (+ note, `objets[]`, `themes[]`) → `{ tasks }` |

### Todoist — note

`:taskRowId` = `jd_note_todoist.id`. Les routes **sans** `:taskRowId` (rétro-compat)
agissent sur la tâche-cache (la plus urgente). Plafond **10 tâches/note**.

| Méthode | Route | Description |
|---|---|---|
| POST | `/jourdoc/:wsId/notes/:id/todoist` | Créer une tâche (INSERT) → `{ id, task_id, url }` |
| POST | `/jourdoc/:wsId/notes/:id/todoist/link` | Lier une tâche existante (URL/ID) |
| GET | `/jourdoc/:wsId/notes/:id/todoist` | Liste `{ tasks[] }` (+ forme mono rétro-compat) |
| POST | `/jourdoc/:wsId/notes/:id/todoist/:taskRowId/close` | Terminer une tâche |
| DELETE | `/jourdoc/:wsId/notes/:id/todoist/:taskRowId` | Détacher une tâche |
| GET | `/jourdoc/:wsId/notes/:id/todoist/:taskRowId/details` | Détails + commentaires |
| POST | `/jourdoc/:wsId/notes/:id/todoist/:taskRowId/import` | Consigner la résolution dans la note |
| | `…/todoist/close`, `…/todoist` (DELETE), `…/todoist/details`, `…/todoist/import` | variantes rétro-compat (tâche-cache) |

### Analyse pluriannuelle

| Méthode | Route | Description |
|---|---|---|
| GET | `/jourdoc/:wsId/analyse` | `?objet_id= &objet_dir= &theme_id= &theme_dir= &nature=` |

Filtre thème via `EXISTS (jd_note_theme)`. Exclut les notes `nature IS NULL`
(documentation intemporelle). `nature=observation|activite` inclut les notes `mixte`.

## Export workspace

`GET /:wsId/export?format=json|csv&medias=0|1`

- **JSON** : `{ workspace, objets, themes, elements, doc_categories, doc_statuts,
  schemas_donnees, notes, medias }` ; chaque note embarque `objets[]`, `themes[]`,
  `elements[]`, `medias[]`, `liens[]`.
- **CSV (ZIP)** : référentiels `objets.csv`, `themes.csv`, `elements.csv`,
  `doc_categories.csv`, `doc_statuts.csv`, `schemas_donnees.csv`, `notes.csv`,
  `medias.csv` + liaisons `note_objets.csv`, `note_themes.csv`, `note_elements.csv`,
  `note_medias.csv`, `liens_notes.csv`. Avec `medias=1`, les fichiers binaires
  (récupérés depuis WebDAV) sont inclus dans le ZIP, plus un **`notes.html`**
  autonome (images du contenu réécrites vers les fichiers locaux).
- **Colonnes JSONB** (`schema_donnees.champs`, `notes.donnees_etendues`) sont
  **sérialisées en JSON texte** pour la cellule CSV (sinon `String()` sur un objet
  produit `[object Object]`).

> **Pas d'import de workspace complet.** L'export ci-dessus est à sens unique
> (archive/backup). Seuls `objets.csv` et `themes.csv` ont un **import** dédié
> (`POST /:wsId/import/objets` / `/import/themes`, cf. plus haut) ; il n'existe pas
> de ré-import de `schemas_donnees` ou des notes.

### Export complet (HTML lisible) — généré côté navigateur

Pour passer à l'échelle sans buter sur le cap 30 s / la RAM serverless, l'export
« complet » est assemblé **dans le navigateur** (module `src/pages/jourdoc/exportWorkspace.js`,
ZIP via `fflate`). Deux endpoints **légers** côté serveur :

- `GET /:wsId/export/facets` → `{ years:[…], counts:{ journal, documentation } }`
  (alimente le sélecteur type/année).
- `GET /:wsId/export/manifest?type=all|journal|documentation&year=YYYY` →
  `{ workspace, filter, generatedAt, notes[], medias[] }`. Pas de binaire : chaque
  note porte ses métadonnées résolues (catégorie, statut, objets/thèmes/éléments,
  liens, médias) ; `medias[]` liste les médias référencés (`id`, `filename` physique,
  `nom_original`, `type_media`).

Le navigateur télécharge ensuite chaque média via `GET /:wsId/medias/:id/file`
(pool de concurrence 4, progression par fichier), puis construit le ZIP :
`index.html` (sommaire groupé Journal/année et Documentation/catégorie), un
`notes/{id}-{slug}.html` par note (métadonnées + contenu images réécrites en
`../medias/…` + annexes), `style.css`, `data.json`.

### Export d'une liste filtrée (vue en l'état) — généré côté navigateur

Module `src/pages/jourdoc/exportList.js` + modale `ExportListModal.jsx`. Déclenché
depuis la **Bibliothèque** et l'**AnalyseView** (bouton 📤) sur les ids des notes
filtrées de la vue. Appelle `POST /:wsId/export/manifest` (ids en corps), trie par date
(**création** pour la documentation, **référence** pour le journal, ↑/↓), puis assemble
un **ZIP** contenant la liste **agrégée** en deux formats : `liste.md` (Markdown via
`turndown`) et `liste.html` (HTML imprimable → « Enregistrer en PDF »). Options : pièces
jointes (dossier `medias/`) et notes liées. Les **images internes des `.md` joints** sont
rapatriées via `GET /:wsId/medias/:id/relfile` au même chemin relatif (assets autonomes).

> Référence des constantes de routes côté front : `packages/shared/src/index.js`
> (objet `API_ROUTES`).
