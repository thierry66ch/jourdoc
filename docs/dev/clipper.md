# Module Clipper — documentation technique (V2)

Web-clipper intégré à JourDoc : capture une page web depuis un navigateur (desktop
d'abord, Android en phase 2) et l'enregistre comme **note de documentation** avec
son contenu converti en Markdown attaché en pièce jointe.

> Ce document acte les **conventions** et l'**architecture** retenues après audit
> du dépôt. Il complète — et corrige — le briefing initial `CLIPPER.md`, qui avait
> été écrit sans accès au code (mauvaises hypothèses sur le langage, le schéma DB,
> les routes, la clé du token). Référence d'implémentation = ce fichier.

## Flux d'ensemble

⚠️ **Architecture en fenêtre popup (CSP-proof).** Le script injecté ne fait AUCUN
appel réseau (la `connect-src`/`frame-src` du site hôte les bloquerait — cf. § CSP).
Il ouvre une fenêtre servie par JourDoc qui fait tout en **same-origin**.

```
[Page web tierce]
  → clic sur le bookmarklet → injection de clipper.js (lanceur JS pur, ~3 Ko)
  → petit bouton in-page « Clipper cette page »
  → clic (geste) : nettoie le HTML, window.open(clipper-app.html) sur JourDoc,
    postMessage { url, title, html } à la fenêtre
  ───────────────  (fenêtre JourDoc, first-party, same-origin)  ───────────────
  → clipper-app : token lu dans localStorage (ou mini-login) → workspace →
    classification → aperçu
  → POST /api/clip { url, html, title, titre_alt, workspaceId, objet_ids, theme_ids, doc_categorie_id }
  → serveur : Readability (linkedom) → Turndown → download images
  → upload .md + assets sur KDrive (EXTDOCS)
  → INSERT jd_medias (markdown, externe) + jd_notes (documentation) + jd_note_media
  → fenêtre : succès + lien vers la note
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

⚠️ **Pas de frontmatter YAML** : Milkdown ne le parse pas → le `---` final crée un
titre setext (faux gras). Les métadonnées sont en **bloc citation** (cadre discret),
lignes séparées par un saut dur (deux espaces avant le `\n`) :

```markdown
# Titre de l'article

> 🔗 **Source :** <https://example.com/url-originale>  
> 🌐 **Site :** Nom du site        (si siteName Readability)
> ✍️ **Auteur :** Prénom Nom       (si byline Readability)
> 🗓 **Capturé le :** 25/06/2026

Contenu Markdown (Turndown + plugin GFM)…

![alt](./_slug.assets/img-001.jpg)
```

### 5. Endpoints `/api/clip/*`

Tout ce que l'overlay appelle depuis une page tierce vit sous `/api/clip/*` pour
bénéficier du CORS réflexif (cf. § Auth) :

| Méthode | Route | Auth | Rôle |
|---|---|---|---|
| `POST` | `/api/clip/login` | publique | mini-login (identifiant+mdp → JWT), même logique que `/api/auth/login` |
| `GET` | `/api/clip/workspaces` | JWT | workspaces JourDoc de l'utilisateur |
| `GET` | `/api/clip/ws/:wsId/taxonomy` | JWT | `{ objets, themes, docCategories }` du workspace |
| `GET` | `/api/clip/ws/:wsId/exists?url=` | JWT | notes du workspace au même `source_url` (avertissement « déjà clippé ») |
| `POST` | `/api/clip` | JWT | capture depuis le **HTML fourni** (bookmarklet) → .md + note |
| `POST` | `/api/clip/ws/:wsId/capture-url` | JWT | capture **serveur d'un lien** : télécharge l'URL → .md, **sans** créer de note (retourne le média à attacher). Utilisé par le bouton « Capturer » de la fiche. |

> **Cœur partagé** : `captureToMd()` (HTML → markdown → images → .md → média) est commun
> au bookmarklet et à la capture serveur. La capture serveur ajoute `fetchPage()`
> (`server/lib/clipper/fetchPage.js` : UA navigateur, redirections, timeout, charset,
> garde anti-SSRF). ⚠️ HTML **brut sans JS** → OK sites « article », échoue sur les SPA.
> Ce même socle resservira pour la **cible de partage** (share-target) Android.

> `/api/clip/login` doit être déclaré **avant** `clip.use('*', authMiddleware)` pour
> rester public.

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
server/lib/clipper/readability.js   ← @mozilla/readability + linkedom (server-only)
server/lib/clipper/turndown.js      ← HTML → Markdown (turndown + turndown-plugin-gfm)
server/lib/clipper/images.js        ← download + upload KDrive + réécriture chemins
server/lib/clipper/slug.js          ← slug/domaine/translittération

# Frontend — lanceur injecté (servi depuis /public)
public/clipper.js                   ← lanceur JS PUR (~3 Ko), injecté par le bookmarklet
vite.clipper.config.js              ← build dédié → public/clipper.js (hors PWA/SW)
src/clipper/launcher.js             ← source du lanceur (bouton + window.open + postMessage)

# Frontend — fenêtre clipper (servie first-party par JourDoc)
public/clipper-app.html             ← page de la fenêtre (charge /clipper-app.js)
public/clipper-app.js               ← bundle React du stepper (~164 Ko, hors PWA/SW)
vite.clipper-app.config.js          ← build dédié → public/clipper-app.js
src/clipper/app.jsx                 ← point d'entrée (monte <ClipperApp/>)
src/clipper/ClipperApp.jsx          ← orchestrateur (reçoit la page, état, appels API same-origin)
src/clipper/ClipperAuth.jsx         ← mini-login same-origin (si pas de token en localStorage)
src/clipper/ui.jsx                  ← styles partagés + Btn + MultiPicker + buildTitreAlt
src/clipper/ClipperWorkspace.jsx    ← étape 1 : sélection workspace
src/clipper/ClipperMeta.jsx         ← étape 2 : titre + objet/thème/catégorie (minimal)
src/clipper/ClipperPreview.jsx      ← étape 3 : récapitulatif + enregistrer
```

⚠️ `ui.jsx` contient du JSX → extension `.jsx` obligatoire (sinon Vite/rollup échoue
en analyse d'import).

## CSP — pourquoi une fenêtre popup (et pas un panneau injecté)

Le script du bookmarklet s'exécute dans le **contexte de la page hôte** et subit donc
sa **Content-Security-Policy**. Sur les sites stricts (ex. `connect-src 'self' …` sans
JourDoc, et `frame-src` restreint), **tout `fetch()` vers l'API JourDoc est bloqué**
(« Failed to fetch ») et une **iframe** vers JourDoc l'est aussi. Une approche « panneau
injecté qui appelle l'API » est donc structurellement condamnée sur ces sites.

✅ **Solution : déporter tout le réseau dans une fenêtre `window.open` sur JourDoc.**
`window.open` (navigation) n'est pas couvert par les directives `fetch`/`frame` de la
CSP → toujours autorisé. La fenêtre est **first-party JourDoc** : ses requêtes sont
en **same-origin** (pas de CORS, pas de CSP tierce), et elle lit le **token** dans son
propre `localStorage`. Le script injecté ne fait que : nettoyer le HTML, `window.open`,
`postMessage({url,title,html})`.

> Tentatives abandonnées (historique) : iframe `auth-bridge` (localStorage tiers
> **partitionné** depuis Chrome 115/Safari/Firefox → token invisible) ; puis panneau
> injecté + `fetch` cross-origin avec CORS réflexif (bloqué par `connect-src`).

## Auth (dans la fenêtre)

- JWT en `localStorage` sous la clé **`token`** (cf. `AuthContext.jsx`) — **pas**
  `jourdoc_token`. La fenêtre étant first-party, `ClipperApp` le lit directement.
- Si absent/expiré (401) : **mini-login** (`ClipperAuth` → `POST /api/clip/login`,
  même origine). Le token obtenu est réécrit en `localStorage` (réutilisable ensuite).
- Token envoyé en `Authorization: Bearer`. Validation JWT côté serveur.

## Bundles & bookmarklet

- Deux IIFE autonomes, buildés à part du front (`build:clipper` lance les deux) et
  **exclus de la PWA/SW** (`globIgnores`) : `clipper.js` (lanceur, ~3 Ko) et
  `clipper-app.js` (stepper React, ~164 Ko, chargé dans la fenêtre).
- **Bookmarklet inchangé** (charge toujours `clipper.js`) :

```javascript
javascript:(function(){
  if(document.getElementById('jd-clipper-root'))return;
  var s=document.createElement('script');
  s.src='https://jourdoc.pogil.ch/clipper.js?t='+Date.now();
  document.body.appendChild(s);
})();
```

## Dépendances

- **Déjà présentes** : `turndown`, `turndown-plugin-gfm`, `webdav`, `react`,
  `react-dom`, `hono`, `jsonwebtoken`.
- **À ajouter** : `@mozilla/readability`, `linkedom` (server-only, léger).
- ⚠️ **PAS `jsdom`** : sur le runtime Node CJS de Vercel, jsdom échoue avec
  `require() of ES Module … @exodus/bytes … not supported` (via `html-encoding-sniffer`).
  On utilise **`linkedom`** (DOM léger compatible Readability). linkedom ne renseigne
  pas `baseURI` → on absolutise nous-mêmes les `href`/`src` (cf. `readability.js`).

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
| CSP du site hôte | gérée par la fenêtre popup (same-origin) → le script injecté ne fait aucun réseau. CORS global reste **verrouillé** sur `VITE_API_URL`. |
| Taille HTML | le **lanceur** nettoie le HTML avant `postMessage` (retire script/style/svg/iframe/médias/gros data: URIs). Serveur : rejet > 4 Mo (413), sous la limite Vercel ~4,5 Mo. |
| Pages SPA | le HTML transmis est le DOM **rendu** (le lanceur tourne dans le navigateur) → Readability OK. |
| Timeout Vercel | images en parallèle (`Promise.allSettled`) ; `maxDuration: 30` dans `vercel.json`. |
| `linkedom` | **server-only**, ne jamais l'importer dans un bundle clipper. PAS jsdom (incompat. Vercel CJS/ESM). |
| Popup bloquée | `window.open` part d'un **geste** (clic sur le bouton in-page) → rarement bloqué ; sinon le lanceur affiche un message. |
| Adaptateur Vercel | `/api/clip` passe par `api/index.js` (reconstruction `Request`) comme le reste. |
```
