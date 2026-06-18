# Module JourDoc — documentation technique (V2)

## Concept

Bloc-notes de terrain liant des **notes** (journal / documentation) à des **objets**
(hiérarchie groupes → individus), des **thèmes** (hiérarchie de sujets, **multiples**
par note) et des **éléments** (étiquettes plates), avec médias (KDrive WebDAV),
tâches Todoist et vues comparatives pluriannuelles.

Le champ **nature** sépare deux espaces : le **journal** a deux natures fixes
(`observation` / `activite`) ; la **documentation** a une **catégorie** ouverte et
gérable par workspace (référentiel `jd_doc_categorie` : nom + emoji + couleur),
affichée en badge coloré. Stockée via `jd_notes.doc_categorie_id` (FK `SET NULL`).

## Shell et hooks

**`JourDocApp.jsx`** — shell : TopBar + nav + `Outlet`. Workspace switcher (portal
pour le menu, position via `getBoundingClientRect`). Sync Todoist silencieuse au
montage et sur `visibilitychange` (throttle 1 min/workspace via `sessionStorage`).

**`hooks.js`**
- `useJdData(wsId, token)` → `{ objets, themes, searchDepth, pickerMode, loading, reload }`
  (charge objets, thèmes et réglages workspace ; `pickerMode` résolu selon la plateforme).
- `useIsMobile()` → `boolean` réactif (`matchMedia`, breakpoint 768 px).
- `authHeader(token)` → headers Bearer + JSON.
- `buildPathMap(items)` → `Map<id, 'chemin/court'>` pour les chemins hiérarchiques.
- `mediaUrl(wsId, id, token)` → URL du proxy media avec `?t=` (pour `<img>`/`<iframe>`).

## Notes

**`NoteForm.jsx`** (création / édition)
- Ordre des champs : **Objets → Éléments → Thèmes**.
- `HierarchyPicker` en **mode multi** pour objets **et** thèmes (state `objet_ids[]`,
  `theme_ids[]`) ; `ElementPicker` pour les éléments.
- **Auto-titre** : titre complet = `objets(', ') → thèmes(', ')` (tous les noms) ;
  titre alternatif (calendrier compact) = noms courts, **max 3** par groupe, au-delà
  les **3 premiers suivis de « … »** — pour objets et thèmes.
- Contenu : `RichTextEditor` (Tiptap), zone **redimensionnable verticalement**.
- Journal → sélecteur **Nature** (observation/activité) ; documentation → sélecteur
  **Catégorie** (liste `docCategories` du workspace, + lien « Gérer »).
- MediaPicker filtré par date ; section Todoist si le workspace est configuré.

**`NoteView.jsx`** — vue lecture 2 colonnes (principale + sidebar : médias, thèmes,
éléments, fil de notes, Todoist). `refreshNote()` évite `window.location.reload()`.
Lightbox photos + PDF (iframe). Navigation contextuelle + swipe.

**`NoteCard.jsx`** — compact : badge nature/type, **chips thèmes (multi)**, objets,
éléments, vignettes médias, chip Todoist. Prop `showDate`.

## Hiérarchies et éléments

**`HierarchyPicker.jsx`** — sélecteur hiérarchique avec recherche et navigation
clavier. Modes `single` / `multi`. Les valeurs sélectionnées s'affichent en **chips**
avec croix de retrait. Prop `filterMode` :
- `scroll` — défile jusqu'à la 1ère correspondance (liste complète) ;
- `filter` — réduit la liste aux seuls éléments correspondants.
Le mode effectif vient de `pickerMode` (réglage workspace, distinct mobile/desktop).

**`ObjetManager.jsx` / `ThemeManager.jsx`** — arbre inline (afficher, renommer,
ajouter enfant, changer de parent), import CSV. Le picker de parent reste en `scroll`.

**`ElementPicker.jsx` / `ElementManager.jsx`** — sélection plate avec création
inline ; fusion d'éléments (`/elements/merge`).

**`DocCategorieManager.jsx`** (dans WorkspaceManager) — CRUD des catégories de
documentation : nom + emoji + couleur (`<input type=color>`) + réordonnancement (↑↓).
La suppression met `doc_categorie_id` à NULL sur les notes concernées (compteur affiché).

**`ObjetDetail.jsx` / `ThemeDetail.jsx`** — notes récursives
(`/objets|themes/:id/notes?direction=both|down|up`) + filtres croisés (les filtres
de thème opèrent sur le tableau `themes[]` des notes). Filtre **par catégorie de
documentation** (apparaît quand des catégories sont présentes ; option « Sans
catégorie » ; masqué si le type est restreint au journal).

## Calendrier & analyse

**`CalendarView.jsx`** — container des modes `year | month | week | last7 | matrix`.
État en URL (`?mode=&anchor=`). Filtres objet + thème (`HierarchyPicker` + direction)
sur mois et année ; le filtre thème teste `note.themes.some(...)`. Swipe tactile.

**`AnalyseView.jsx`** — 52 buckets hebdomadaires × N années. Filtres objet + thème +
nature. Surlignage cross-année, marqueur semaine courante, popup via `createPortal`.
Pleine largeur (`jd-main--wide`).

## Bibliothèque

**`BibliothequeView.jsx`** (`/bibliotheque`) — parcours de toute la documentation
du workspace, **groupée en étagères par catégorie**. Charge `GET /notes?type=documentation`
(pas de route dédiée). Recherche (titre + titre_alt + contenu HTML détaggé), tri
(récent / A→Z), légende de catégories cliquables (chips colorées + compteurs, dont
« Sans catégorie »). **Densité** cartes / compact (persistée en `localStorage`).
**Filtres secondaires** objet + thème via `HierarchyPicker` + portée
ancêtres/descendants (`getRelated` avec `searchDepth`). Chaque étagère a un bandeau
coloré repliable + une grille de `NoteCard` (ou liste compacte). Tout est calculé
côté client (`useMemo`). **Filtres persistés en query params** (`useSearchParams`,
`replace`) → restaurés au retour depuis une note ; **position de défilement**
sauvegardée/restaurée via `sessionStorage` (conteneur `.jd-main`).

## Médias & stockage

Upload : `POST /:wsId/medias` (multipart). Traitement serveur (imports dynamiques) :
- **HEIC** → `heic-convert` d'abord (sharp ne supporte pas HEIC sur Vercel Lambda),
- resize via **sharp**, date EXIF via **exifreader** (`await`).
- Fichier envoyé sur **KDrive WebDAV** ; `jd_medias.fichier` = chemin WebDAV complet.

**Module storage** (`packages/storage/index.js`) : `uploadFile`, `downloadFile`,
`listFiles`, `deleteFile`, `listInbox`, `moveFromInbox`. Le proxy
`GET /:wsId/medias/:id/file` télécharge depuis WebDAV et sert le binaire.

**Inbox** (`server/routes/inbox.js`) : `GET /:wsId/inbox` liste, `POST /:wsId/inbox/scan`
importe les fichiers déposés (sous-dossier `WEBDAV_PATH_INBOX/{wsId}/`).

**Documents Markdown** (`MarkdownModal.jsx`) — nouveau `type_media='markdown'`.
Pièces jointes `.md` (import ou création « + Document » depuis une note). Modal
plein écran : visualiseur (md→HTML via `marked` → `RichTextView`) et **éditeur
WYSIWYG** (réutilise `RichTextEditor`/Tiptap ; sauvegarde HTML→md via `turndown`).
Contenu lu/écrit sur WebDAV (`GET`/`PUT /medias/:id/content`, `getTextFile`/
`putTextFile`). Création depuis l'**éditeur** de note (NoteForm, bouton « + Document »),
lecture/édition depuis NoteView et MediaGallery ; exclu des lightbox/vignettes photo.
Fermeture protégée (confirmation si `dirty`, clic backdrop sécurisé). Dépendances :
`marked`, `turndown`, `turndown-plugin-gfm` (tableaux GFM).

`RichTextEditor` (partagé notes + docs) : Tiptap StarterKit (H1–H3), Underline, Link,
**TableKit** (tableaux redimensionnables + add/del lignes/colonnes), mode source
paramétrable (`htmlToSource`/`sourceToHtml` → Markdown dans le modal).

## Todoist

**`TodoistPanel.jsx`** (sidebar NoteView) — créer / lier (extraction d'ID depuis
slug `nom-kebab-TASKID`), statut, terminer, consigner (import date + lien + commentaires).
`onNoteUpdated` pour re-fetch sans reload.

**`TodoistTasks.jsx`** (`/todoist-tasks`) — sections 🔔 À traiter / ⏳ En cours /
✅ Traités. Consigner → `tache_todoist_consigne = TRUE`. Affiche `themes[]` + objets.

**Sync batch** (`POST /:wsId/todoist/sync`) — interroge les tâches non terminées,
détecte terminées / récurrentes / actives, stocke `tache_todoist_content`.

## Référence

- Routes détaillées : `docs/dev/api.md`
- Schéma DB : `docs/dev/database.md`
- Auth : `docs/dev/auth.md`
- Architecture & déploiement : `docs/dev/architecture.md`
- Constantes de routes front : `packages/shared/src/index.js`
