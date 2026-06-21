# Base de données — JourDoc V2

**PostgreSQL** hébergé sur **Neon**, accédé via `@neondatabase/serverless`.
Schéma de référence : [`db/schema.sql`](../../db/schema.sql). Client : `db/db.js`.

## Accès — syntaxe Neon

```js
import sql from './db/db.js'

// Tagged template (requêtes simples, paramètres échappés)
const notes = await sql`SELECT * FROM jd_notes WHERE workspace_id = ${wsId}`

// Fonction avec params dynamiques (WHERE construit à la volée)
const rows = await sql(queryString, paramsArray)
```

**Jamais** `sql.unsafe()` — c'est l'API de postgres.js, pas de Neon.

## Pièges de types PostgreSQL

- Les colonnes `DATE` reviennent en **objets `Date` JS**, pas en string.
  Normaliser avec `fmtDate()` (`jourdoc.js`) → `'YYYY-MM-DD'`.
- `COALESCE(col, FALSE)` exige une colonne **BOOLEAN** (pas TEXT).
- Alias CTE réservés : `desc`, `order`, `group` → utiliser `descendants`, `ancestors`.
- `SERIAL` / sequences : après import avec `OVERRIDING SYSTEM VALUE`,
  réinitialiser via `SELECT setval(seq, max(id)) FROM table`.

## Schéma (relations)

```
users ──< user_app_access >── apps
users ──< user_workspace_access >── workspaces ──< jd_objets   (auto-réf parent_id)
                                                ──< jd_themes   (auto-réf parent_id)
                                                ──< jd_elements
                                                ──< jd_notes ──< jd_note_objet   >── jd_objets
                                                             ──< jd_note_theme   >── jd_themes
                                                             ──< jd_note_element >── jd_elements
                                                             ──< jd_note_media   >── jd_medias
                                                             ──< jd_note_note (auto-réf, fil documentaire)
admin (compte unique, OTP)
```

## Tables — Portail

### `users`
`id` SERIAL PK · `username` UNIQUE · `email` UNIQUE · `password_hash` (bcryptjs) ·
`is_active` BOOLEAN · `created_at` · `reset_token` TEXT · `reset_expires` TEXT
(les deux derniers ajoutés par la migration `002`, pour le flux mot de passe oublié).

### `apps`
`id` · `slug` UNIQUE (ex. `jourdoc`) · `name` · `icon` · `description` · `is_active`.

### `workspaces`
| Colonne | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `app_id` | → `apps.id` | |
| `name` | TEXT | |
| `created_by` | → `users.id` | |
| `created_at` | TIMESTAMPTZ | |
| `jd_search_depth` | INTEGER (déf. 3) | profondeur du filtrage hiérarchique |
| `jd_picker_mode_mobile` | TEXT (déf. `filter`) | mode HierarchyPicker mobile |
| `jd_picker_mode_desktop` | TEXT (déf. `scroll`) | mode HierarchyPicker desktop |
| `todoist_token` / `todoist_project_id` / `todoist_project_nom` | TEXT | config Todoist |

### `user_workspace_access`
`user_id` + `workspace_id` (PK composite, CASCADE) · `role` (`owner` | `member`).

### `admin`
Compte unique, login 2 étapes par OTP email. Colonnes `otp_code`, `otp_expires`.

## Tables — JourDoc

### `jd_objets` (hiérarchie groupes → individus)
`id` · `workspace_id` (CASCADE) · `parent_id` (auto-réf, NULL = racine) · `nom` ·
`nom_court` (abréviation pour `titre_alt`) · `est_individu` BOOLEAN · `description` · `created_at`.

### `jd_themes` (hiérarchie sujets)
`id` · `workspace_id` (CASCADE) · `parent_id` (auto-réf) · `nom` · `nom_court` · `created_at`.

### `jd_elements` (étiquettes plates)
`id` · `workspace_id` (CASCADE) · `nom` · `created_at` · `UNIQUE (workspace_id, nom)`.

### `jd_doc_categorie` / `jd_doc_statut` (référentiels documentation)
Référentiels ouverts par workspace : sous-natures (`jd_doc_categorie`) et statuts
(`jd_doc_statut`) des notes `documentation`. Même schéma : `id` · `workspace_id`
(CASCADE) · `nom` · `icon` (emoji) · `couleur` (hex) · `ordre` · `created_at` ·
`UNIQUE (workspace_id, nom)`. Seedés à la création d'un workspace (catégories :
Conseil/Descriptif/Manuel/Norme/Exemple ; statuts : Brouillon/Validé/Obsolète).

### `jd_notes`
| Colonne | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `workspace_id` | → `workspaces.id` | CASCADE |
| `type` | TEXT CHECK | `journal` \| `documentation` |
| `nature` | TEXT CHECK | `observation` \| `activite` \| NULL (documentation) |
| `theme_id` | → `jd_themes.id` | **legacy** — conservé, = 1er thème (voir liaison `jd_note_theme`) |
| `doc_categorie_id` | → `jd_doc_categorie.id` | `ON DELETE SET NULL` — catégorie (documentation) |
| `doc_statut_id` | → `jd_doc_statut.id` | `ON DELETE SET NULL` — statut (documentation) |
| `doc_auteur` / `doc_reference` | TEXT | documentation : auteur/source, date de réf. / version |
| `titre` | TEXT | obligatoire, auto-générable |
| `titre_alt` | TEXT | version courte (noms courts) pour le calendrier compact |
| `contenu` | TEXT | HTML (Tiptap) |
| `date` | DATE | NULL pour documentation |
| `source_url` | TEXT | documentation |
| `tache_todoist_*` | divers | id, due, priority, done, recurrence_done, consigne, content |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### Tables de liaison
| Table | Colonnes | Notes |
|---|---|---|
| `jd_note_objet` | `note_id` + `objet_id` | N-N, PK composite, CASCADE |
| `jd_note_theme` | `note_id` + `theme_id` | N-N (thèmes multiples), CASCADE — migration `004` |
| `jd_note_element` | `note_id` + `element_id` | N-N, CASCADE |
| `jd_note_media` | `note_id` + `media_id` | N-N, CASCADE |
| `jd_note_note` | `note_source_id` + `note_cible_id` + `type_lien` | fil documentaire, auto-réf |

> **Thèmes multiples** : une note peut être liée à plusieurs thèmes via
> `jd_note_theme`. `jd_notes.theme_id` est conservé (legacy/compat) et alimenté
> en écriture avec le **premier** thème. Le front envoie `theme_ids[]`.

### `jd_medias`
`id` · `workspace_id` (CASCADE) · `fichier` (**chemin WebDAV complet**, ex.
`/pogil.ch/Apps_datas/JourDoc/uploads/2/uuid.jpg`) · `nom_original` · `type_media`
(`photo` | `pdf`) · `mime_type` · `taille` · `date_prise` (DATE, EXIF ou upload) ·
`lie` BOOLEAN (lié à au moins une note) · `externe` BOOLEAN (fichier *lié* sous
`WEBDAV_PATH_EXTDOCS` — non supprimé au détachement) · `created_at`.

Le proxy `GET /:wsId/medias/:id/file` dérive `dir` et `filename` du `fichier`
par `lastIndexOf('/')`. Uploads sous `WEBDAV_PATH_UPLOADS/{wsId}/`,
inbox sous `WEBDAV_PATH_INBOX/{wsId}/`.

## Migrations

Migrations numérotées dans [`db/migrations/`](../../db/migrations/)
(`001_…`, `002_…`). **Appliquées manuellement** sur Neon (Vercel ne les joue pas) :

```bash
node --env-file=.env.local -e "
import('./db/db.js').then(async ({ default: sql }) => {
  await sql\`...\`
  process.exit(0)
})"
```

État actuel :
- `001_fix_todoist_consigne_type.sql` — type de `tache_todoist_consigne` → BOOLEAN
- `002_add_reset_token.sql` — `users.reset_token` + `reset_expires`
- `003_add_picker_mode.sql` — `workspaces.jd_picker_mode_mobile` / `_desktop`
- `004_note_theme_multi.sql` — table `jd_note_theme` + reprise des `theme_id` existants
- `005_doc_categorie.sql` — table `jd_doc_categorie` + `jd_notes.doc_categorie_id` + seed
- `006_doc_fields.sql` — `jd_notes.doc_auteur` / `doc_statut` / `doc_reference`
- `007_doc_statut_ref.sql` — table `jd_doc_statut` + `jd_notes.doc_statut_id` (remplace `doc_statut` texte)
- `008_media_externe.sql` — `jd_medias.externe` (pièces jointes *liées*)

**Convention** : nouvelle évolution de schéma → fichier de migration numéroté
**et** mise à jour de `schema.sql` (référence d'un schéma vierge).

## Migration des données V1 → V2

Scripts ponctuels dans `db/` : import SQLite → Neon (`OVERRIDING SYSTEM VALUE`
+ `setval` pour les sequences ; tri topologique des tables auto-référentielles
`jd_objets`/`jd_themes` avant INSERT pour éviter les violations de FK) et copie
des fichiers locaux → KDrive WebDAV.
