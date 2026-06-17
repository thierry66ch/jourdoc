# Architecture — pogil-apps

## Vue d'ensemble

Monorepo npm workspaces. Un seul processus Node.js sert l'API REST + les fichiers statiques en production.

```
pogil-apps/
├── apps/hub/          React 18 + Vite 5 (PWA)
├── packages/shared/   Constantes partagées front/back
├── server/            Hono 4 REST API + serveStatic
└── data/              pogil.db (SQLite WAL) + uploads/
```

## Flux de données

```
Développement :
  Navigateur :5173 → Vite dev server → proxy /api/* → Hono :3000 → SQLite

Production :
  Navigateur → Hono :3000 → /api/*  → SQLite
                          → /*      → apps/hub/dist/ (Vite build)
```

## Frontend (`apps/hub`)

**Dépendances principales :**
- React 18, react-router-dom v6 (BrowserRouter, Outlet)
- Tiptap v3 (rich text : starter-kit, link, underline)
- i18next + react-i18next (FR/EN)
- vite-plugin-pwa 0.20 (injectManifest strategy, workbox)

**Structure des routes React :**
```
/                       → Portal
/login                  → Login
/admin/login            → AdminLogin
/admin                  → AdminDashboard
/jourdoc/:wsId          → JourDocApp (shell nav)
  /                       → JourDocJournal
  /calendar               → CalendarView (mois/sem/7j/matrice/année + filtres)
  /medias                 → MediaGallery
  /media/:id              → MediaDetail
  /objets                 → ObjetManager
  /themes                 → ThemeManager
  /notes/:id              → NoteView
  /notes/:id/edit         → NoteForm (edit)
  /new                    → NoteForm (create)
  /objet/:id              → ObjetDetail
  /theme/:id              → ThemeDetail
  /settings               → WorkspaceManager
  /todoist-tasks          → TodoistTasks
  /analyse                → AnalyseView (max-width supprimé via jd-main--wide)
```

**State management :** Local state React uniquement (useState/useEffect). Données workspace (objets, thèmes) via hook `useJdData(wsId, token)` — cache en mémoire pour la session. État calendrier persisté dans URL params (`useSearchParams`).

**Auth côté client :** `AuthContext` → token user dans `localStorage`, token admin dans `sessionStorage`. `<PrivateRoute>` et `<AdminRoute>` dans `main.jsx`.

**PWA :**
- SW : workbox precache + `clientsClaim()` + `skipWaiting()` → mise à jour immédiate sans fermer les onglets
- `manifest.webmanifest` servi par route Hono dédiée (Content-Type correct, non par serveStatic)
- Icône maskable `icon-maskable-512.png` : logo centré avec 10% safe zone (générée via sharp)

**Portal pattern :** Dropdowns devant échapper à `overflow: auto` parent (workspace switcher, popup analyse) → `createPortal(document.body)` + `position: fixed` calculée via `getBoundingClientRect()`.

## Backend (`server`)

**Dépendances principales :**
- hono 4 + @hono/node-server
- node:sqlite (Node ≥ 22.5, synchronous API, WAL, FK)
- bcryptjs, jsonwebtoken (JWT HS256)
- nodemailer (OTP admin email)
- sharp + heic-convert (resize + HEIC→JPEG)
- exifreader (date EXIF photos)

**Structure des fichiers :**
```
server/index.js          Point d'entrée : .env, rate limiting, routes, serveStatic, SPA fallback
  Routes spéciales :
    GET  /manifest.webmanifest         → MIME application/manifest+json
    GET  /.well-known/assetlinks.json  → TWA digital asset links (ch.pogil.apps)
server/routes/
  auth.js       /api/auth/*   — login, register, me
  portal.js     /api/me/*     — apps, workspace selector
  admin.js      /api/admin/*  — dashboard, users, settings OTP
  jourdoc.js    /api/jourdoc/*— toute la logique JourDoc (voir api.md)
server/middleware/authMiddleware.js    — vérifie JWT, pose c.set('userId')
server/db/db.js       — connexion SQLite + migrations idempotentes
server/db/schema.sql  — tables initiales (CREATE TABLE IF NOT EXISTS)
```

**Middleware `wsCheck` :** Vérifie `user_workspace_access`, pose `c.set('wsId', Number)`. Appliqué globalement via `jourdoc.use('/:wsId/*', wsCheck)`.

## Patterns récurrents

**Filtrage hiérarchique JS** (`getRelated` dans `calUtils.js`) :
- Calcule en JS l'ensemble des IDs ancêtres/descendants à partir de la liste complète des nœuds du workspace
- Direction : `'down'` | `'up'` | `'both'`
- Utilisé côté client (CalendarView, AnalyseView, ObjetDetail, ThemeDetail) et côté serveur (route `/analyse`)

**Filtrage hiérarchique SQL** (route `/:wsId/objets/:id/notes`) :
- CTE récursif SQLite WITH RECURSIVE, maxDepth = 3

**Buckets hebdomadaires** (`weekBucket` dans `calUtils.js`) :
- `bucket = min(floor((date - jan1) / 7j), 51)` → 52 colonnes par an
- Alignement cohérent entre années, indépendant du numéro ISO de semaine

**Todoist — détection récurrence** :
- Si `currentDue > storedDue && !isDone` → occurrence exécutée → `tache_todoist_recurrence_done = 1`
- Faux positifs sur report de date sont acceptables (pas d'automatisation)

## Déploiement (Infomaniak)

Push Git → auto `npm install && npm run build && npm start` depuis la racine du repo.
CWD = racine obligatoire car `serveStatic` résout `apps/hub/dist` relativement.

Variables d'environnement (`.env`) :
```
JWT_SECRET          obligatoire
JWT_EXPIRES_IN      ex. 7d
PORT                défaut 3000
ADMIN_EMAIL
SMTP_HOST/PORT/USER/PASS   optionnel (OTP affiché en console en dev si absent)
DB_PATH             défaut data/pogil.db
```
