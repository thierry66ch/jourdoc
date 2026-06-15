# CLAUDE.md — JourDoc V2

Contexte complet pour Claude Code. Lire entièrement avant toute modification.

## Origine du projet

JourDoc V2 est une extraction et migration de JourDoc V1, qui tournait dans un
monorepo sur Infomaniak (Node.js unique, SQLite). V2 est un repo dédié, déployé
sur Vercel, avec PostgreSQL (Neon) et stockage fichiers via KDrive WebDAV.

La stack applicative est **inchangée** : Hono 4 + React 18 + Vite 5 + vite-plugin-pwa.
Pas de réécriture, pas de Next.js. Seuls l'hébergement, la base de données et le
stockage fichiers changent.

## Commandes

```bash
npm install          # installe toutes les dépendances
npm run dev          # Vite (port 5173) + Hono local (port 3000) en parallèle
npm run build        # build React → dist/
npm start            # prod locale : sert API + static sur port 3000
```

Déploiement : `git push` → Vercel détecte et déploie automatiquement (~35s).

## Architecture

```
jourdoc/                        ← repo racine (plus de monorepo)
├── src/                        ← React 18 + Vite (front)
│   ├── pages/jourdoc/          ← tous les composants JourDoc (portés de V1)
│   ├── context/AuthContext.jsx
│   └── main.jsx
├── api/                        ← Hono 4 en mode Vercel serverless
│   └── index.js                ← point d'entrée unique (voir §Hono/Vercel)
├── packages/
│   └── storage/                ← module WebDAV mutualisé (voir §Storage)
├── server/
│   └── routes/jourdoc.js       ← routes portées de V1 (logique inchangée)
├── db/
│   ├── schema.sql              ← schéma PostgreSQL (porté depuis SQLite)
│   └── db.js                   ← client Neon (@neondatabase/serverless)
├── vite.config.js
├── vercel.json
└── .env.example
```

## Hono sur Vercel (adaptation serverless)

En V1, Hono tournait avec `@hono/node-server` (process persistant).
Sur Vercel, chaque requête est une fonction serverless. Le changement est minimal :

```js
// api/index.js
import { handle } from 'hono/vercel'
import app from '../server/app.js'
export const config = { runtime: 'nodejs20.x' }
export default handle(app)
```

`server/app.js` contient l'app Hono avec toutes les routes montées — identique
à V1 sauf que `@hono/node-server` n'est plus utilisé.

`vercel.json` :
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" },
    { "source": "/(.*)",     "destination": "/index.html"   }
  ]
}
```

## Base de données — PostgreSQL via Neon

Driver : `@neondatabase/serverless` (optimisé pour les fonctions serverless,
gère le connection pooling).

```js
// db/db.js
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL)
export default sql
```

Utilisation dans les routes :
```js
import sql from '../db/db.js'
const notes = await sql`SELECT * FROM jd_notes WHERE workspace_id = ${wsId}`
```

**Important** : `node:sqlite` (V1) est remplacé par des requêtes SQL taguées.
Les requêtes elles-mêmes sont quasi identiques — PostgreSQL et SQLite partagent
la même syntaxe pour les opérations courantes. Différences à surveiller :
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY` (ou `BIGSERIAL`)
- `BOOLEAN` : SQLite stocke 0/1, PostgreSQL a un vrai type BOOLEAN
- `DATETIME DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMPTZ DEFAULT NOW()`
- Pas de `ALTER TABLE` idempotent en PG — utiliser des migrations numérotées

Le schéma complet est dans `db/schema.sql`. Les migrations post-init sont dans
`db/migrations/` (fichiers numérotés `001_xxx.sql`, `002_xxx.sql`…).

## Module Storage — WebDAV via KDrive

Toutes les opérations fichiers passent par `packages/storage/index.js`.
Ce module est l'unique endroit qui connaît WebDAV. Les routes Hono appellent
ses fonctions sans savoir comment les fichiers sont stockés.

```js
// packages/storage/index.js
import { createClient } from 'webdav'

function getClient() {
  return createClient(process.env.WEBDAV_URL, {
    username: process.env.WEBDAV_USER,
    password: process.env.WEBDAV_PASSWORD,
  })
}

export async function uploadFile(appPath, filename, buffer, mimetype) { ... }
export async function downloadFile(appPath, filename) { ... }
export async function listFiles(appPath) { ... }
export async function deleteFile(appPath, filename) { ... }
export async function listInbox(appPath) { ... }
export async function moveFromInbox(appPath, filename, destPath) { ... }
```

`appPath` est toujours une variable d'environnement, jamais hardcodé :

```js
// Dans une route Hono :
import { uploadFile, listInbox } from '../packages/storage/index.js'

// Upload média JourDoc
await uploadFile(process.env.WEBDAV_PATH_UPLOADS, filename, buffer, mimetype)

// Scan inbox JourDoc
const files = await listInbox(process.env.WEBDAV_PATH_INBOX)
```

### Chemins WebDAV (variables d'environnement)

```bash
WEBDAV_URL=https://connect.drive.infomaniak.com
WEBDAV_USER=ton@email.com
WEBDAV_PASSWORD=xxxxxxxxx          # mot de passe d'application KDrive

# Chemins spécifiques à JourDoc (configurables sans toucher au code)
WEBDAV_PATH_UPLOADS=/pogil.ch/Apps_datas/JourDoc/uploads
WEBDAV_PATH_INBOX=/pogil.ch/Apps_datas/JourDoc/inbox
```

Pour RandoLib (futur projet), ce sera `WEBDAV_PATH_TRACKS` et `WEBDAV_PATH_INBOX`
avec `/Apps_data/RandoLib/tracks` et `/Apps_data/RandoLib/inbox`.

### Scan inbox automatique

Un endpoint dédié déclenche le scan de l'inbox et l'intégration des fichiers
trouvés. Appelable manuellement depuis l'UI ou via un cron Vercel.

```js
// server/routes/inbox.js
app.get('/api/jourdoc/:wsId/inbox/scan', authMiddleware, async (c) => {
  const files = await listInbox(process.env.WEBDAV_PATH_INBOX)
  // Pour chaque fichier : créer un média en DB, déplacer vers uploads/
  ...
})
```

## Auth — identique à V1

JWT maison, deux niveaux (user / admin), OTP email pour l'admin.
Voir V1 CLAUDE.md pour le détail — aucun changement.

Le rate limiting en mémoire (Map) fonctionne en serverless avec une nuance :
chaque instance Vercel a sa propre Map. Acceptable pour un usage personnel.
Si besoin, migrer vers un rate limiting Redis/Upstash ultérieurement.

## Variables d'environnement

Fichier `.env.local` en local (jamais commité). Mêmes valeurs dans
Vercel → Settings → Environment Variables.

```bash
# Base de données
DATABASE_URL=postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/jourdoc?sslmode=require

# Auth
JWT_SECRET=                        # openssl rand -base64 32
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=ton@email.com

# Email (OTP admin)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# WebDAV KDrive
WEBDAV_URL=https://connect.drive.infomaniak.com
WEBDAV_USER=ton@email.com
WEBDAV_PASSWORD=                   # mot de passe d'application KDrive (pas le mdp principal)

# Chemins WebDAV JourDoc
WEBDAV_PATH_UPLOADS=/pogil.ch/Apps_datas/JourDoc/uploads
WEBDAV_PATH_INBOX=/pogil.ch/Apps_datas/JourDoc/inbox

# Todoist
TODOIST_CLIENT_ID=
TODOIST_CLIENT_SECRET=

# App
VITE_API_URL=https://jourdoc.pogil.ch
```

## PWA

Identique à V1 : `vite-plugin-pwa`, `injectManifest`, `sw.js` custom.
Le manifest est servi par une route Hono dédiée avec `Content-Type: application/manifest+json`.

## Build number & CHANGELOG

Même convention que V1 :
- `build.json` à la racine : `{ "build": 1, "date": "2026-06-14T..." }`
- Injecté par Vite via `define` (`__BUILD_NUMBER__`, `__BUILD_DATE__`)
- Workflow : `build.json` → `npm run build` → `git commit` → `git push`
- Entrée en tête de `CHANGELOG.dev.md` à chaque itération

## Domaine et DNS

- Domaine : `jourdoc.pogil.ch`
- DNS : CNAME `jourdoc.pogil.ch` → `cname.vercel-dns.com`
- Configurer dans Vercel : Settings → Domains → ajouter `jourdoc.pogil.ch`

## Ce qui a changé par rapport à V1

| Composant | V1 | V2 |
|---|---|---|
| Hébergement | Infomaniak (monorepo) | Vercel (repo dédié) |
| Base de données | SQLite (`node:sqlite`) | PostgreSQL (Neon, `@neondatabase/serverless`) |
| Fichiers | `data/uploads/` local | KDrive WebDAV (`packages/storage/`) |
| Point d'entrée serveur | `@hono/node-server` | `hono/vercel` handle |
| Migrations DB | `ALTER TABLE` idempotents dans `db.js` | Fichiers numérotés dans `db/migrations/` |

## Ce qui N'a PAS changé

- Stack React 18 + Vite 5 + vite-plugin-pwa
- Hono 4 (routes, middleware, logique)
- Auth JWT maison (structure, tokens, OTP)
- Intégration Todoist
- Tous les composants React (`src/pages/jourdoc/`)
- Logique métier (hiérarchies, calendar, analyse…)
