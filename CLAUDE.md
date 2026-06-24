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

**Build number** : incrémenter `build.json` à chaque déploiement significatif,
puis committer avec le code.

```bash
node -e "
const b = JSON.parse(require('fs').readFileSync('build.json'));
b.build++; b.date = new Date().toISOString();
require('fs').writeFileSync('build.json', JSON.stringify(b, null, 2));
console.log('Build', b.build);
"
```

## Architecture

```
jourdoc-v2-scaffold/
├── src/                        ← React 18 + Vite (front)
│   ├── pages/jourdoc/          ← tous les composants JourDoc
│   ├── pages/admin/            ← dashboard admin
│   ├── pages/Login.jsx         ← login user
│   ├── pages/ForgotPassword.jsx
│   ├── pages/ResetPassword.jsx
│   ├── context/AuthContext.jsx
│   └── main.jsx                ← router React
├── api/
│   └── index.js                ← adaptateur Vercel→Hono (voir §Hono/Vercel)
├── packages/
│   ├── storage/index.js        ← module WebDAV mutualisé
│   └── shared/src/index.js     ← API_ROUTES + constantes partagées
├── server/
│   ├── app.js                  ← montage des routes Hono
│   ├── middleware/
│   │   ├── authMiddleware.js   ← JWT user (accepte aussi ?t= query param)
│   │   └── adminMiddleware.js  ← JWT admin
│   └── routes/
│       ├── auth.js             ← login/logout/forgot-password/reset-password
│       ├── admin.js            ← CRUD users, settings admin OTP
│       ├── portal.js           ← /api/me/apps + /api/me/apps/:slug/workspaces
│       ├── jourdoc.js          ← toutes les routes métier JourDoc
│       └── inbox.js            ← scan inbox WebDAV
├── db/
│   ├── schema.sql              ← schéma PostgreSQL complet
│   ├── db.js                   ← client Neon
│   ├── migrations/             ← migrations numérotées (001_, 002_…)
│   └── seed.js                 ← données initiales (admin + user)
├── build.json                  ← { "build": N, "date": "..." }
├── vite.config.js
└── vercel.json
```

## Hono sur Vercel — adaptateur manuel

`hono/vercel` handle ne fonctionne **pas** avec le runtime Node.js de Vercel car il
reçoit `IncomingMessage` et non une Web API `Request`. L'adaptateur est fait à la
main dans `api/index.js` :

```js
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  // Reconstruit une Web API Request depuis IncomingMessage
  // Passe à app.fetch(), retranscrit la Response dans res
}
```

Ne jamais revenir à `import { handle } from 'hono/vercel'` — ça timeout.

## Auth — JWT

Deux niveaux :

- **User** : `authMiddleware` vérifie `Authorization: Bearer <token>` **ou** `?t=<token>`
  (query param nécessaire pour les `<img src>` et `<iframe src>` qui ne peuvent pas
  envoyer de headers). Utiliser `mediaUrl(wsId, id, token)` de `hooks.js` pour
  construire les URLs media.
- **Admin** : `adminMiddleware` vérifie le rôle `admin` dans le JWT.

## Base de données — PostgreSQL via Neon

Driver : `@neondatabase/serverless`. Syntaxe :

```js
// Tagged template (requêtes simples)
const notes = await sql`SELECT * FROM jd_notes WHERE workspace_id = ${wsId}`

// Fonction avec paramètres dynamiques (WHERE dynamique)
const rows = await sql(queryString, paramsArray)
```

**Jamais** `sql.unsafe()` — c'est l'API de postgres.js, pas de Neon.

### Types PostgreSQL à surveiller

- Les colonnes `DATE` retournent des objets `Date` JS, pas des strings.
  Utiliser `fmtDate()` dans `jourdoc.js` pour normaliser en `'YYYY-MM-DD'`.
- `COALESCE(col, FALSE)` exige que `col` soit BOOLEAN, pas TEXT.
  Si une colonne SQLite était stockée en TEXT, migrer avec
  `ALTER COLUMN ... TYPE BOOLEAN USING (col IN ('true','1','TRUE'))`.
- Les alias CTE : `desc`, `order`, `group` sont des mots réservés PostgreSQL.
  Utiliser `descendants`, `ancestors`, etc.
- `SERIAL` / sequences : après import avec `OVERRIDING SYSTEM VALUE`,
  réinitialiser avec `SELECT setval(seq, max(id)) FROM table`.

## Module Storage — WebDAV KDrive

```js
// packages/storage/index.js — fonctions disponibles :
uploadFile(appPath, filename, buffer, mimetype)   // → fullPath stocké en DB
downloadFile(appPath, filename)                    // → Buffer
listFiles(appPath)                                 // → [{filename, size, …}]
deleteFile(appPath, filename)
listInbox(inboxPath)
moveFromInbox(inboxPath, filename, destPath, destName)  // déplace sans conversion
```

**Structure des fichiers en base** : `fichier` contient le chemin WebDAV complet,
ex: `/pogil.ch/Apps_datas/JourDoc/uploads/2/uuid.jpg`.
Le proxy dérive `dir` et `filename` par `lastIndexOf('/')`.

**Sous-dossiers par workspace** : uploads à `WEBDAV_PATH_UPLOADS/{wsId}/`,
inbox à `WEBDAV_PATH_INBOX/{wsId}/`, fichiers liés à `WEBDAV_PATH_EXTDOCS/{wsId}/`.

**Images relatives d'un MD** (lié ou importé) : servies par le proxy
`GET /:wsId/medias/:id/relfile?rel=&t=`, relatif au **dossier réel** du média
(`dirname(media.fichier)`) — unifie uploads et external.

**Inbox `.zip`** : bundle MD + images décompressé dans `uploads/{wsId}/{uuid}/`
(arborescence interne préservée), un média `markdown` géré par `.md` (`adm-zip`).

**WEBDAV_URL** : utiliser `https://connect.drive.infomaniak.com` (URL générique).
**Ne pas** utiliser l'URL user-spécifique `https://NNNN.connect.kdrive.infomaniak.com`
— le chemin `/pogil.ch/…` n'y est pas accessible.

## Traitement images

- `sharp` : resize, conversion JPEG — disponible sur Vercel mais **sans support HEIC**
  (libheif absent dans Lambda).
- `heic-convert` : conversion HEIC→JPEG — à utiliser **en premier** pour HEIC,
  puis sharp pour le resize éventuel.
- `exifreader` : extraction date EXIF — fonction `async`, toujours `await`.
- Tous ces modules doivent être importés dynamiquement (`await import(…)`)
  pour ne pas bloquer l'init serverless.

## Middleware Hono — wildcard

En Hono v4, le wildcard pour `.use()` doit être `'/path/*'` et non `'/path*'`.

```js
admin.use('/settings/*', adminMiddleware)  // ✓
admin.use('/settings*',  adminMiddleware)  // ✗ — route non trouvée (404)
```

## Routes montées dans app.js

```js
app.route('/api/auth',    authRoutes)    // login, logout, forgot/reset-password
app.route('/api/admin',   adminRoutes)   // login admin, users, settings
app.route('/api/me',      portalRoutes)  // apps + workspaces (pas /api !)
app.route('/api/jourdoc', jourdocRoutes) // toutes les routes métier
app.route('/api/jourdoc', inboxRoutes)   // inbox séparé, même préfixe
```

## Variables d'environnement

```bash
DATABASE_URL=postgresql://…@ep-xxx.neon.tech/jourdoc?sslmode=require
JWT_SECRET=
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

WEBDAV_URL=https://connect.drive.infomaniak.com   # URL générique, pas user-specific
WEBDAV_USER=
WEBDAV_PASSWORD=                                   # mot de passe d'application KDrive

WEBDAV_PATH_UPLOADS=/pogil.ch/Apps_datas/JourDoc/uploads
WEBDAV_PATH_INBOX=/pogil.ch/Apps_datas/JourDoc/inbox
WEBDAV_PATH_EXTDOCS=/pogil.ch/Apps_datas/JourDoc/external   # fichiers « liés » (réf. externe), scopé par workspace : external/{wsId}/

TODOIST_CLIENT_ID=
TODOIST_CLIENT_SECRET=

VITE_API_URL=https://jourdoc.pogil.ch
```

## Build number & CHANGELOG

- `build.json` à la racine : `{ "build": N, "date": "ISO" }`
- Injecté par Vite via `define` : `__BUILD_NUMBER__`, `__BUILD_DATE__`
- **Incrémenter à chaque déploiement significatif** avant le commit/push

## Journal des itérations

À chaque itération, ajouter une entrée en tête de `CHANGELOG.dev.md`.

## Documentation développeur

Maintenir `docs/dev/` : `architecture.md`, `database.md`, `api.md`, `jourdoc.md`, `auth.md`. Ne pas dupliquer CLAUDE.md — se concentrer sur décisions d'architecture, flux de données, points d'extension.

## Domaine et DNS

- `jourdoc.pogil.ch` → CNAME `cname.vercel-dns.com`
- `VITE_API_URL=https://jourdoc.pogil.ch` dans les env vars Vercel

## Migrations DB

Les migrations sont dans `db/migrations/` (numérotées `001_`, `002_`…).
Appliquer manuellement sur Neon :

```bash
node --env-file=.env.local -e "
import('./db/db.js').then(async ({ default: sql }) => {
  await sql\`...\`
  process.exit(0)
})"
```

## Pièges connus (session de migration 2026-06-16)

1. **hono/vercel handle** → timeout. Utiliser l'adaptateur manuel dans `api/index.js`.
2. **sql.unsafe()** → n'existe pas avec Neon. Utiliser `sql(query, params)`.
3. **DATE PostgreSQL** → objet JS Date, pas string. Normaliser avec `fmtDate()`.
4. **CTE alias réservés** → `desc`, `order`… Utiliser `descendants`, `ancestors`.
5. **COALESCE(text_col, FALSE)** → erreur de type. Migrer la colonne en BOOLEAN.
6. **sharp + HEIC** → non supporté sur Vercel Lambda. Utiliser `heic-convert` d'abord.
7. **await import() async** → toujours `await extractExifDate()` (fonction async).
8. **Hono use() wildcard** → `'/path/*'` et non `'/path*'`.
9. **portalRoutes** → monter sur `/api/me`, pas `/api` (conflit avec autres routes).
10. **WEBDAV_URL user-specific** → le préfixe `/pogil.ch/` n'est accessible que
    via l'URL générique `connect.drive.infomaniak.com`.
11. **mediaUrl()** → utiliser `mediaUrl(wsId, id, token)` de `hooks.js` pour toute
    URL media dans les composants React (img/iframe ne peuvent pas envoyer de headers).
12. **Migration self-référentielle** → `jd_objets`, `jd_themes` ont `parent_id`.
    Trier topologiquement avant INSERT pour éviter les FK violations.
13. **Sequences après import** → réinitialiser avec `setval` après import avec
    `OVERRIDING SYSTEM VALUE`.
14. **WebDAV : compte PROPRIÉTAIRE obligatoire pour le listing** → avec un compte qui
    accède à `Apps_datas` en **partage** (ex. `thierry.portmann@pogil.ch`),
    `getDirectoryContents`/`stat`/`exists` renvoient **404** (seul le GET/PUT fichier
    marche). Avec le compte **propriétaire** du dossier (`apps@pogil.ch`), le PROPFIND
    fonctionne à tous les niveaux. ⇒ `WEBDAV_USER`/`WEBDAV_PASSWORD` doivent être ceux du
    compte propriétaire (navigateur EXTDOCS + inbox scan en dépendent).
15. **Images Markdown encodées** → les liens d'images des exports (Notion…) encodent les
    espaces (`%20`). Décoder le `src` (`decodeURIComponent`) avant de bâtir le chemin du
    proxy `extdocs/file`, sinon double-encodage → 404.

## Pièges éditeur Markdown / Milkdown (session 2026-06-23/24)

L'éditeur des docs `.md` liés est **Milkdown** (markdown-natif), voie *composée*
(`@milkdown/kit` + `@milkdown/react`), PAS Crepe. Les notes restent sur **Tiptap**.
Voir `MilkdownDocEditor.jsx`, `milkdownExtras.js`, `milkdownSlash.js`, `MilkdownToolbar.jsx`.

16. **« Éditeur markdown clé en main » est un mythe** → afficher du markdown éditable et
    *écrire un .md propre/portable* sont deux problèmes distincts. Chaque construction
    (callout, surlignage, math…) exige un pont **dans les deux sens** : un `$remark`
    (parse mdast + stringify via `toMarkdownExtensions`) **et** un markSchema/nodeSchema
    Milkdown. Round-trips validables en **Node** (remark sans DOM) avant câblage.
17. **Crepe tire Vue + CodeMirror en peers obligatoires** → inadapté à React. Utiliser la
    voie composée `@milkdown/kit` (commonmark + gfm + listener + history) + `@milkdown/react`.
18. **`remark-preserve-empty-line`** (dans le preset commonmark) sérialise chaque paragraphe
    vide en `<br />` → pollue le `.md`. Le **filtrer du preset** (`commonmark.filter(...)`).
19. **Hardbreaks → `\` visible** → CommonMark sérialise un saut dur par `\` en fin de ligne ;
    un `\` **isolé** (hardbreak seul dans un paragraphe) s'affiche littéralement (marked +
    éditeurs externes). `cleanMd` convertit ces `\` en **deux espaces** (hors blocs de code).
20. **Espace insécable = U+00A0, JAMAIS `&nbsp;`** → l'espacement « ligne vide » insère le
    vrai caractère (`schema.text(' ')`), pas l'entité HTML. Mais marked colle un nbsp
    en fin de ligne au paragraphe précédent et l'efface → le **visualiseur** doit isoler les
    lignes nbsp-seul en paragraphe autonome (`isolateNbsp` dans `mdToHtmlView`).
21. **Insérer un bloc au curseur** (séparateur, ligne vide) → `tr.replaceSelectionWith(node)`
    coupe le bloc au bon endroit (avant en début de ligne, split entre deux mots). Ne pas
    utiliser `$from.after()` (insère toujours après).
22. **Marqueur de liste (puce/numéro/case)** rendu d'après les attrs **du `list_item`**
    (`listType`/`label`/`checked`), pas le type de liste parent. Le composant Vue officiel
    `listItemBlockComponent` ne reflétait pas `checked` → on rend via un **nodeView maison**
    (numéro = compteur CSS, case cliquable). Convertir une liste = mettre à jour les attrs
    des `list_item`, pas seulement le nœud liste.
23. **Nœuds math = atomes** sans édition intégrée → `handleDoubleClickOn` (prompt LaTeX).
    Math inline = `textContent`, math bloc = `attrs.value`.
24. **Bundle Milkdown lourd (~500 KB+)** → charger `MilkdownDocEditor` en **lazy chunk** et
    relever `injectManifest.maximumFileSizeToCacheInBytes` (PWA, défaut 2 MiB).
25. **API composée** : `callCommand(cmd.key, payload)` (le `.key` est requis) ; `.use()`
    accepte un tableau ; `useEditor(factory)` appelle `.create()` en interne ; images à
    token via un **nodeView** du nœud `image` (réécrit le `src` affiché, garde le relatif).

## État de production (2026-06-16)

Fonctionnalités opérationnelles :

- Auth user (login, logout, forgot/reset password)
- Auth admin (login OTP, settings OTP, changement email/mdp)
- Workspaces (création, accès)
- Notes, calendrier, objets, thèmes, éléments, liens
- Médias (upload direct, inbox scan, proxy WebDAV, miniatures)
- HEIC → JPEG via heic-convert + resize via sharp
- Todoist (création tâche, liaison, page tâches, consignation)
- Migration SQLite→Neon + fichiers→KDrive (scripts dans db/)
- Documents Markdown liés/importés : éditeur **Milkdown** markdown-natif (toolbar, slash,
  callouts GitHub, surlignage couleur, math KaTeX éditable, tableaux, listes à cocher,
  images collées → assets externes, mode source). Navigateur de fichiers externes (créer/
  lier). Import de bundles Notion (zip imbriqués). Voir `docs/dev/jourdoc.md` §Médias.

Workspaces existants :

- id=1 : "Jardin (test)" — workspace de test conservé
- id=2 : workspace de production principal
- id=3 : autre workspace de production
