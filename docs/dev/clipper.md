# Module Clipper — documentation technique (V2)

Web-clipper intégré à JourDoc : capture une page web depuis un navigateur (desktop
d'abord, Android en phase 2) et l'enregistre comme **note de documentation** avec
son contenu converti en Markdown attaché en pièce jointe.

> Ce document acte les **conventions** et l'**architecture** retenues après audit
> du dépôt. Il complète — et corrige — le briefing initial `CLIPPER.md`, qui avait
> été écrit sans accès au code (mauvaises hypothèses sur le langage, le schéma DB,
> les routes, la clé du token). Référence d'implémentation = ce fichier.

## Flux d'ensemble

```
[Page web tierce]
  → clic sur le bookmarklet
  → injection de clipper.js (bundle React autonome)
  → iframe auth-bridge.html (lit le JWT dans localStorage de jourdoc.pogil.ch)
  → overlay : workspace → classification minimale → aperçu
  → POST /api/clip { url, html, title, workspaceId, objet_ids, theme_ids, doc_categorie_id }
  → serveur : Readability → Turndown → download images
  → upload .md + assets sur KDrive (EXTDOCS)
  → INSERT jd_medias (markdown, externe) + jd_notes (documentation) + jd_note_media
  → overlay : succès + lien vers la note dans JourDoc
```

## Décisions d'architecture

### 1. Réutilisation maximale de l'existant

Le clipper ne crée **aucun** circuit parallèle quand un équivalent existe :

| Besoin | Réutilise |
|---|---|
| Stockage `.md` + images | mécanique **EXTDOCS** (documents liés « vivants », éditables Milkdown) |
| Upload images | `uploadFile()` de `packages/storage` dans `_<slug>.assets/` (convention `medias/:id/asset`) |
| Création note | logique de `POST /api/jourdoc/:wsId/notes` (type `documentation`) |
| Liaison note↔média | `jd_note_media` + `refreshLie()` |
| Liste workspaces / objets / thèmes / catégories | endpoints `/api/me/...` et `/api/jourdoc/:wsId/...` existants |
| Auth | `authMiddleware` (Bearer **ou** `?t=`), payload `sub` = userId |

Conséquence directe : un document clippé est immédiatement **consultable et
éditable** dans l'éditeur Milkdown de JourDoc (utile pour reprendre une page mal
structurée).

### 2. Type de note

`jd_notes.type = 'documentation'` (NOT NULL, CHECK `journal|documentation`).
- `titre` ← titre Readability (éditable dans l'overlay).
- `contenu` ← excerpt Readability en HTML (`<p>…</p>`), comme corps court de la note.
- `source_url` ← URL d'origine (**colonne déjà présente**, aucune migration).
- `doc_categorie_id` ← optionnel (référentiel `jd_doc_categorie` du workspace).
- `doc_statut_id` ← laissé NULL au clip.
- Classification : objets (M2M `jd_note_objet`), thèmes (M2M `jd_note_theme`),
  éléments (M2M `jd_note_element`) — tous optionnels au clip.

> ⚠️ Le modèle réel **n'est pas** une cascade Objet→Thème→Catégorie→Élément (erreur
> du briefing). Objets et thèmes sont deux hiérarchies **indépendantes** (M2M, auto-
> référentielles via `parent_id`) ; les éléments sont des étiquettes plates ; la
> « catégorie » (`jd_doc_categorie`) ne concerne que la documentation.

### 3. Convention de stockage KDrive (EXTDOCS)

```
{WEBDAV_PATH_EXTDOCS}/{wsId}/clipper/{domaine}/{slug}.md
{WEBDAV_PATH_EXTDOCS}/{wsId}/clipper/{domaine}/_{slug}.assets/img-001.jpg
```

- `{domaine}` = hostname de l'URL source, slugifié (ex. `fr-wikipedia-org`).
- `{slug}` = titre Readability translittéré, lowercase, espaces/spéciaux → `-`,
  tronqué à 80 car., suffixe timestamp en cas de collision.
- Le dossier d'assets suit la convention existante `_<base>.assets/` (cf.
  `medias/:id/asset`), ce qui rend les images servies par le proxy `relfile` sans
  code supplémentaire.
- Média enregistré avec `type_media='markdown'`, `mime_type='text/markdown'`,
  `externe=TRUE`, `fichier` = chemin complet.

### 4. Format du `.md` attaché

```markdown
---
title: "Titre de l'article"
source: "https://example.com/url-originale"
author: "Prénom Nom"        # si byline Readability
site: "Nom du site"          # si siteName Readability
clipped: "2026-06-25"
---

# Titre de l'article

Contenu Markdown (Turndown + plugin GFM)…

![alt](./_slug.assets/img-001.jpg)
```

### 5. Endpoint `/api/clip`

- Router dédié `server/routes/clipper.js`, monté `app.route('/api/clip', …)`.
- **CORS propre** : `origin: '*'`, **sans** `credentials` (le token transite en
  Bearer / `?t=`, pas en cookie). Le CORS **global** de `app.js`
  (`origin: VITE_API_URL, credentials: true`) bloquerait sinon les appels depuis des
  domaines tiers — il faut s'assurer qu'il n'écrase pas le CORS de cette route, et
  gérer le préflight `OPTIONS`.
- `authMiddleware` puis contrôle d'accès au `workspaceId` (équivalent `wsCheck`,
  mais le wsId vient du **body**, pas d'un param d'URL).
- Garde-fou : rejeter le HTML > 3 Mo (413).

Body :

```json
{
  "url": "https://…",
  "html": "<!doctype html>…",        // DOM rendu, capturé côté navigateur
  "title": "…",                       // optionnel, fallback document.title
  "workspaceId": 2,
  "objet_ids": [], "theme_ids": [], "element_ids": [],
  "doc_categorie_id": null
}
```

Réponse : `{ noteId, noteUrl, mediaId, uploadedImages, failedImages }`.
`noteUrl` = `/jourdoc/{wsId}/notes/{noteId}` (route React confirmée).

### 6. Traitement images

- Résolution des URLs relatives en absolues (base = URL source).
- Téléchargement parallèle `Promise.allSettled`, timeout 8 s, taille max 8 Mo.
- `data:` base64 → décodage + upload direct.
- Échec (404, timeout, image privée) → **URL d'origine conservée** dans le `.md`.
- Réécriture des chemins en relatif `./_slug.assets/img-NNN.ext`.
- Tient compte du timeout Vercel (10 s hobby / 60 s pro) — d'où le parallélisme.

## Fichiers du module

```
# Backend (JavaScript, ESM — pas de TypeScript)
server/routes/clipper.js            ← endpoint POST /api/clip (+ CORS dédié)
server/lib/clipper/readability.js   ← @mozilla/readability + jsdom (server-only)
server/lib/clipper/turndown.js      ← HTML → Markdown (turndown + turndown-plugin-gfm)
server/lib/clipper/images.js        ← download + upload KDrive + réécriture chemins
server/lib/clipper/slug.js          ← slug/domaine/translittération

# Frontend clipper (bundle autonome servi depuis /public)
public/auth-bridge.html             ← pont JWT cross-origin (clé localStorage = "token")
public/clipper.js                   ← bundle React injecté par le bookmarklet (buildé)
vite.clipper.config.js              ← build dédié → public/clipper.js (hors PWA/SW)

# Source du bundle clipper
src/clipper/main.jsx                ← point d'entrée (injecte iframe + overlay)
src/clipper/bridge.js               ← postMessage avec auth-bridge.html
src/clipper/ClipperOverlay.jsx      ← stepper 3 étapes
src/clipper/ClipperAuth.jsx         ← mini-login si JWT absent
src/clipper/ClipperWorkspace.jsx    ← étape 1 : sélection workspace
src/clipper/ClipperMeta.jsx         ← étape 2 : titre + objet/thème/catégorie (minimal)
src/clipper/ClipperPreview.jsx      ← étape 3 : aperçu + enregistrer
```

## Auth & bridge

- JWT stocké dans `localStorage` sous la clé **`token`** (cf. `AuthContext.jsx`) —
  **pas** `jourdoc_token`.
- `auth-bridge.html` tourne dans une iframe cachée sur `jourdoc.pogil.ch`, lit/écrit
  cette clé et la transmet par `postMessage`. Sécurité assurée par la validation JWT
  côté serveur (le bridge ne fait que lire/écrire le token).
- Le bundle clipper récupère le token via le bridge, l'envoie en `Authorization:
  Bearer` (ou `?t=` pour les médias).

## Bundle & bookmarklet

- `clipper.js` est buildé **séparément** du front principal (`vite.clipper.config.js`),
  en IIFE autonome, déposé dans `/public`. **Exclu de la PWA / du service worker**
  pour ne pas polluer le précache (le SW principal utilise `injectManifest`).
- Le bundle n'importe **pas** le router ni le store global de JourDoc ; il peut
  réutiliser des composants UI isolés mais aucun layout.
- Bookmarklet (affiché dans les réglages JourDoc en phase 5) :

```javascript
javascript:(function(){
  if(document.getElementById('jd-clipper-root'))return;
  var s=document.createElement('script');
  s.src='https://jourdoc.pogil.ch/clipper.js?t='+Date.now();
  document.body.appendChild(s);
})();
```

- Overlay : `position:fixed; top:20px; right:20px; z-index:2147483647`, 340 px
  desktop, plein écran sous 480 px, cibles tactiles ≥ 48 px, `all: initial` sur la
  racine pour s'isoler des styles de la page hôte.

## Dépendances

- **Déjà présentes** : `turndown`, `turndown-plugin-gfm`, `webdav`, `react`,
  `react-dom`, `hono`, `jsonwebtoken`.
- **À ajouter** : `@mozilla/readability`, `jsdom` (server-only, ~30 Mo, aucun impact
  sur le bundle front car jamais importés côté client).

## Ordre de livraison

- **Phase 1 — Infra & auth** : `auth-bridge.html`, `bridge.js`, `main.jsx` + overlay
  minimal, `vite.clipper.config.js`. Valider la récupération du token via bookmarklet.
- **Phase 2 — Endpoint sans images** : `readability.js`, `turndown.js`, `clipper.js`
  (route), flux end-to-end (images en URLs absolues).
- **Phase 3 — UI complète** : workspace + classification minimale + aperçu.
- **Phase 4 — Images** : `images.js`, intégration, gestion des erreurs.
- **Phase 5 — Polish** : bookmarklet dans les réglages, détection « déjà clippé »
  (`source_url` par workspace), redirection optionnelle vers la note.
- **Mobile (Web Share Target)** : itération ultérieure (phase 2 produit).

## Points d'attention

| Sujet | Détail |
|---|---|
| CORS `/api/clip` | appelé depuis domaines tiers ; CORS dédié `*`, ne pas laisser le CORS global l'écraser ; gérer `OPTIONS`. |
| Taille HTML | rejeter > 3 Mo (413). |
| Pages SPA | le HTML envoyé est le DOM **rendu** (le bookmarklet tourne dans le navigateur) → Readability OK. |
| Timeout Vercel | images en parallèle (`Promise.allSettled`). |
| `jsdom` | **server-only**, ne jamais l'importer dans le bundle clipper. |
| Adaptateur Vercel | `/api/clip` passe par `api/index.js` (reconstruction `Request`) comme le reste. |
```
