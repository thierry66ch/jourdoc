# Architecture — JourDoc V2

## Origine

JourDoc V2 est l'extraction de l'app JourDoc depuis le monorepo V1 `pogil-apps`
(processus Node unique, SQLite, hébergement Infomaniak) vers un **repo dédié**.
La stack applicative est **inchangée** (Hono 4 + React 18 + Vite 5 + PWA) ;
seuls changent l'hébergement, la base de données et le stockage fichiers :

| | V1 (pogil-apps) | V2 (jourdoc-v2) |
|---|---|---|
| Hébergement | Infomaniak, Node unique | **Vercel** (serverless) |
| Base de données | SQLite (`node:sqlite`, WAL) | **PostgreSQL Neon** (`@neondatabase/serverless`) |
| Stockage fichiers | disque local `data/uploads/` | **KDrive WebDAV** |
| Statique + API | un seul process `npm start` | Vercel static + fonction serverless |

## Vue d'ensemble

```
jourdoc-v2-scaffold/
├── src/                    React 18 + Vite 5 (front, PWA)
│   ├── pages/jourdoc/      composants métier JourDoc
│   ├── pages/admin/        dashboard admin
│   ├── context/            AuthContext
│   ├── lib/                utilitaires transverses (voir ci-dessous)
│   ├── clipper/            fenêtre first-party du web-clipper
│   └── main.jsx            router React + installAuthInterceptor()
├── api/index.js            adaptateur Vercel → Hono (voir ci-dessous)
├── server/
│   ├── app.js              montage des routes Hono
│   ├── middleware/         authMiddleware, adminMiddleware
│   └── routes/             auth, admin, portal, jourdoc, inbox
├── packages/
│   ├── storage/index.js    module WebDAV KDrive mutualisé
│   └── shared/src/index.js API_ROUTES + constantes partagées
└── db/
    ├── schema.sql          schéma PostgreSQL complet
    ├── db.js               client Neon
    ├── migrations/         migrations numérotées (001_, 002_…)
    └── seed.js             admin + user initiaux
```

## Flux de données

```
Développement (npm run dev) :
  Navigateur :5173 → Vite dev server → proxy /api/* → Hono :3000 → Neon / KDrive

Production (Vercel) :
  Navigateur → /api/*  → fonction serverless api/index.js → app.fetch() → Neon / KDrive
            → /*       → dist/ (build Vite, CDN Vercel)
```

## Hono sur Vercel — adaptateur manuel

`hono/vercel` `handle()` **ne fonctionne pas** avec le runtime Node de Vercel :
il reçoit un `IncomingMessage` et non une Web API `Request` → timeout.
L'adaptateur est écrit à la main dans [`api/index.js`](../../api/index.js) :

```js
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  // reconstruit une Request Web API depuis IncomingMessage,
  // appelle app.fetch(request), retranscrit la Response dans res
}
```

**Ne jamais** revenir à `import { handle } from 'hono/vercel'`.

## Frontend (`src/`)

**Dépendances principales :** React 18, react-router-dom v6 (BrowserRouter, Outlet),
Tiptap (notes : starter-kit, link, underline, table, task-list, image, highlight, mention),
Milkdown (`@milkdown/kit` + `plugin-math` + `plugin-clipboard`, éditeur des docs `.md`),
`marked` + `turndown` (conversions Markdown↔HTML), `heic2any` (HEIC→JPEG navigateur, lazy),
`exifreader` (date EXIF client), `fflate` (ZIP des exports), vite-plugin-pwa (injectManifest).

**Routes React** (`main.jsx`) :
```
/                       → Portal (sélection app/workspace)
/login                  → Login
/forgot-password        → ForgotPassword
/reset-password         → ResetPassword
/admin/login            → AdminLogin
/admin                  → AdminDashboard
/jourdoc/:wsId          → JourDocApp (shell nav, Outlet)
  /                       → JourDocJournal
  /calendar               → CalendarView (mois/sem/7j/matrice/année + filtres)
  /medias /media/:id      → MediaGallery / MediaDetail
  /objets /themes /elements → managers hiérarchie + éléments
  /bibliotheque           → BibliothequeView (documentation par catégorie)
  /notes/:id /notes/:id/edit /new → NoteView / NoteForm
  /objet/:id /theme/:id   → ObjetDetail / ThemeDetail
  /todoist-tasks          → TodoistTasks
  /analyse                → AnalyseView
  /settings               → WorkspaceManager
```

**State :** local React (useState/useEffect). Données workspace (objets, thèmes,
réglages) via le hook `useJdData(wsId, token)`. État de vue (filtres, mode, période)
persisté en **URL query params** (`useSearchParams`, `replace`) pour Calendar, Analyse
et Bibliothèque → restauré au retour depuis une note.

**Utilitaires `src/lib/` :**
- `authInterceptor.js` — wrapper `window.fetch` : 401 → purge token + redirige `/login`
  (session expirée, cf. `auth.md`).
- `imageUpload.js` — préparation des images **avant upload** : conversion HEIC→JPEG
  (`heic2any`, lazy) et resize `<img>`+canvas à 1600 px (contourne la limite ~4,5 Mo de
  Vercel) ; lit la date EXIF de l'original (`exifreader`) **avant** re-encodage, transmise
  au serveur (champ `dates[]`).
- `markdownPaste.js` — détection + conversion Markdown→HTML (`marked`) pour le collage
  dans l'éditeur de notes (Tiptap).

**Auth client :** `AuthContext` → token user en `localStorage`, token admin en
`sessionStorage`. `<PrivateRoute>` / `<AdminRoute>` dans `main.jsx`.

**URLs media :** `<img>`/`<iframe>` ne peuvent pas envoyer de header → le token
passe en query `?t=` (cf. `authMiddleware`). Toujours construire les URLs media
avec `mediaUrl(wsId, id, token)` de `hooks.js`.

## Backend (`server/`)

**Dépendances :** hono 4, `@neondatabase/serverless`, bcryptjs, jsonwebtoken
(JWT HS256), nodemailer (OTP admin + emails reset), sharp + heic-convert (resize +
HEIC→JPEG), exifreader (date EXIF). Les modules de traitement image sont importés
**dynamiquement** (`await import(...)`) pour ne pas bloquer l'init serverless.

**Routes montées dans `app.js` :**
```js
app.route('/api/auth',    authRoutes)    // login, logout, forgot/reset-password
app.route('/api/admin',   adminRoutes)   // login OTP, users, settings
app.route('/api/me',      portalRoutes)  // apps + workspaces (PAS /api)
app.route('/api/jourdoc', jourdocRoutes) // logique métier (voir api.md)
app.route('/api/jourdoc', inboxRoutes)   // scan inbox WebDAV (même préfixe)
```

**Middleware `wsCheck`** (jourdoc.js) : vérifie `user_workspace_access`, pose
`c.set('wsId', Number)`. Wildcard Hono v4 : `'/:wsId/*'` (et non `'/:wsId*'`).

## Patterns récurrents

- **Filtrage hiérarchique JS** (`getRelated`, `calUtils.js`) : ensemble des IDs
  ancêtres/descendants depuis la liste plate des nœuds, direction `down|up|both`,
  profondeur = `jd_search_depth` du workspace. Utilisé côté client (Calendar,
  Analyse, ObjetDetail, ThemeDetail) et côté serveur (`/analyse`, `/themes/:id/notes`).
- **Buckets hebdomadaires** (`weekBucket`) : `min(floor((date - jan1)/7j), 51)` →
  52 colonnes/an, alignées entre années.
- **Todoist — détection récurrence** : `currentDue > storedDue && !isDone` →
  occurrence exécutée → `tache_todoist_recurrence_done = TRUE`.
- **Picker hiérarchique** : `HierarchyPicker` a un mode `filter` (réduit la liste)
  ou `scroll` (défile), réglable par workspace et par plateforme (mobile/desktop)
  via `jd_picker_mode_*`.

## Déploiement (Vercel)

`git push` → Vercel détecte et déploie (~35 s). Build : `vite build` → `dist/`.
Les **migrations DB sont appliquées manuellement** sur Neon (voir `database.md`).

Incrémenter `build.json` (`{ build, date }`) avant chaque déploiement significatif ;
injecté par Vite via `define` (`__BUILD_NUMBER__`, `__BUILD_DATE__`).

Variables d'environnement : voir `CLAUDE.md` (DATABASE_URL, JWT_*, SMTP_*,
WEBDAV_*, TODOIST_*, VITE_API_URL).
