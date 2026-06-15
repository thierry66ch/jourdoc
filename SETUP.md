# Guide de mise en place — JourDoc V2
# À lire par Claude Code au début de chaque session de travail sur ce projet.

## Contexte

Ce repo est JourDoc V2, extrait du monorepo Infomaniak V1.
Stack inchangée (Hono + React + Vite), seuls changent :
- Hébergement : Vercel (au lieu d'Infomaniak)
- Base de données : PostgreSQL Neon (au lieu de SQLite)
- Fichiers : KDrive WebDAV (au lieu de data/uploads/ local)

Lire CLAUDE.md pour le contexte complet avant toute modification.

---

## Étapes de mise en place (à faire une seule fois)

### Étape 1 — Créer le repo GitHub

```bash
# Sur GitHub : créer un repo "jourdoc" (public recommandé pour Vercel Hobby)
# Puis en local, dans le dossier du fork :
git remote set-url origin git@github.com:TON_USER/jourdoc.git
git push -u origin main
```

### Étape 2 — Créer le projet Neon

1. Aller sur https://console.neon.tech
2. New Project → nom "jourdoc" → région **eu-central-1 (Frankfurt)**
3. Copier la connection string (format `postgresql://...`)
4. La coller dans `.env.local` comme valeur de `DATABASE_URL`

Initialiser le schéma :
```bash
npm run db:init
```

### Étape 3 — Préparer KDrive

Sur KDrive Infomaniak, créer l'arborescence :
```
/Apps_data/
  JourDoc/
    uploads/     ← médias traités
    inbox/       ← dépôt mobile (drag depuis apps)
```

Créer un mot de passe d'application KDrive :
- manager.infomaniak.com → kDrive → Paramètres → Mots de passe d'application
- Nom : "JourDoc V2"
- Copier dans `WEBDAV_PASSWORD` dans `.env.local`

### Étape 4 — Configurer Vercel

1. vercel.com → New Project → importer le repo GitHub "jourdoc"
2. Framework Preset : **Other** (pas Next.js !)
3. Build Command : `npm run build`
4. Output Directory : `dist`
5. Settings → Environment Variables → ajouter TOUTES les variables de `.env.example`
   (avec les vraies valeurs)
6. Settings → Domains → ajouter `jourdoc.pogil.ch`

### Étape 5 — DNS

Chez le registrar de pogil.ch, ajouter :
```
jourdoc    CNAME    cname.vercel-dns.com
```
(TTL : 300 ou moins pour propagation rapide)

### Étape 6 — Porter le code de V1

Les fichiers suivants sont à copier depuis le repo V1 et adapter :

| Depuis V1 | Vers V2 | Adaptation nécessaire |
|---|---|---|
| `apps/hub/src/pages/jourdoc/` | `src/pages/jourdoc/` | Aucune |
| `apps/hub/src/context/`       | `src/context/`       | Aucune |
| `server/routes/auth.js`       | `server/routes/auth.js`   | Remplacer `node:sqlite` par `sql` de Neon |
| `server/routes/jourdoc.js`    | `server/routes/jourdoc.js` | Remplacer `node:sqlite` + adapter requêtes médias → storage/ |
| `server/middleware/`          | `server/middleware/`  | Aucune |
| `packages/shared/`            | `packages/shared/`    | Aucune |
| `apps/hub/public/`            | `public/`             | Aucune |
| `apps/hub/src/sw.js`          | `src/sw.js`           | Aucune |

**Point d'attention principal** : dans `server/routes/jourdoc.js`, toutes les
opérations sur `data/uploads/` (upload, download, list, delete) sont à remplacer
par les fonctions du module `packages/storage/index.js`.

Exemple de remplacement dans la route upload média :
```js
// V1 (à supprimer)
import fs from 'fs'
fs.writeFileSync(`data/uploads/${filename}`, buffer)

// V2 (remplacer par)
import { uploadFile } from '../../packages/storage/index.js'
await uploadFile(process.env.WEBDAV_PATH_UPLOADS, filename, buffer, mimetype)
```

### Étape 7 — Migration des données V1 → V2

Une fois le projet en place et les schémas validés, migrer les données existantes.

```bash
# Sur la machine avec accès à V1 (SQLite) :
node db/migrate-from-sqlite.js

# Ce script (à créer) :
# 1. Lit pogil.db (SQLite V1)
# 2. Insère dans PostgreSQL Neon (V2)
# 3. Pour chaque média : upload vers KDrive WebDAV
```

Les données V1 sont peu volumineuses (début d'utilisation), la migration
sera rapide. La V1 reste en service sur Infomaniak pendant toute la migration.

---

## Workflow quotidien (identique à V1)

```
npm run dev         → dev local (Vite :5173 + Hono :3000)
# ... coder, tester ...
# Incrémenter build.json
npm run build
git add . && git commit -m "build X — description"
git push
# → Vercel déploie automatiquement (~35s)
# → Tester sur jourdoc.pogil.ch
```

---

## Checklist avant premier déploiement

- [ ] Repo GitHub créé et poussé
- [ ] Projet Neon créé (région Frankfurt), schéma initialisé
- [ ] Dossiers KDrive créés (`/Apps_data/JourDoc/uploads/` et `/inbox/`)
- [ ] Mot de passe d'application KDrive créé
- [ ] `.env.local` rempli et testé en local (`npm run dev`)
- [ ] Projet Vercel créé, toutes les env vars saisies
- [ ] CNAME `jourdoc.pogil.ch` ajouté chez le registrar
- [ ] Domaine validé dans Vercel
- [ ] Code V1 porté et adapté (routes SQL + storage)
- [ ] Test complet en prod : login, note, upload média, inbox scan
