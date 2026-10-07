# Module JourDoc — documentation technique (V2)

## Concept

Bloc-notes de terrain liant des **notes** (journal / documentation) à des **objets**
(hiérarchie groupes → individus), des **thèmes** (hiérarchie de sujets, **multiples**
par note) et des **éléments** (étiquettes plates), avec médias (KDrive WebDAV),
tâches Todoist et vues comparatives pluriannuelles.

Le champ **nature** sépare deux espaces : le **journal** a trois natures
(`observation` / `activite` / `mixte`) ; la **documentation** a une **catégorie** ouverte
et gérable par workspace (référentiel `jd_doc_categorie` : nom + emoji + couleur),
affichée en badge coloré. Stockée via `jd_notes.doc_categorie_id` (FK `SET NULL`).

La nature **`mixte`** (« Observ.→Activité », icône 🔀, couleur dédiée `#db2777`) apparaît
à la fois dans les listes filtrées **Observations** et **Activités** (serveur :
`nature IN (filtre,'mixte')` sur `/notes` et `/analyse`). Le rendu couleur/icône passe
partout par `noteVisual()` (`hooks.js`) et les classes `jd-badge-mixte` / `cal-dot--mix`.
Pas de filtre « mixte seul ».

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
- **Auto-titre** : titre complet = `catégories(', ') — objets(', ') → thèmes(', ')` (tous
  les noms, catégories dans l'ordre de la liaison) ; titre alternatif (calendrier compact) =
  noms courts, **max 3** par groupe, au-delà les **3 premiers suivis de « … »**.
- Contenu : `RichTextEditor` (Tiptap), zone **redimensionnable verticalement**.
- **Images de l'éditeur HTML** : collage/dépôt → **upload en pièce jointe** (proxy média,
  plus de base64) via `onImageUpload` ; bouton 🖼 pour insérer une image déjà jointe.
  `src` stocké = `/api/jourdoc/{wsId}/medias/{id}/file` **sans token** ; affichage via le
  proxy authentifié (nodeView `resolveImg` en édition, `resolveContentImages` en lecture).
  Les anciennes images base64 restent affichées telles quelles.
- Journal → sélecteur **Nature** (observation / activité / **🔀 mixte**).
- **Catégories** (`CategoriePicker.jsx`, juste sous type/nature) : multi-sélection
  **ordonnée** (★ met en tête : couleur + tête du titre), libellé contextuel **« Apports »**
  (doc) / **« Interventions »** (journal), propositions **filtrées par la portée**
  (`categoriesPourContexte`). Saisie dans les **deux sens** : nature puis catégories (la liste
  se filtre) ou catégories puis nature (`natureSuggeree` : `nature_defaut`, ou `mixte` si
  une catégorie d'observation + une d'activité). Une catégorie devenue hors contexte reste
  affichée, signalée ⚠️ (jamais retirée en silence).
- MediaPicker filtré par date ; section Todoist si le workspace est configuré.
- **Joindre une photo (mobile)** : boutons **📷 Photo** (`capture="environment"`) et
  **🖼️ Galerie** (`multiple`) → pipeline `prepareUploadFiles` (resize + HEIC + date EXIF,
  cf. `src/lib/imageUpload.js`) puis `POST /medias` et liaison à la note.
- **Coller du Markdown** : bouton **📋md** (barre d'outils) → lit le presse-papiers via
  `navigator.clipboard.readText()` (fiable sur mobile, contrairement à l'événement `paste`)
  et l'insère interprété. Voir `RichTextEditor` / `MilkdownToolbar` plus bas.

**`NoteView.jsx`** — vue lecture 2 colonnes (principale + sidebar : médias, thèmes,
éléments, fil de notes, Todoist). `refreshNote()` évite `window.location.reload()`.
Lightbox photos + PDF (iframe). Navigation contextuelle + swipe.

**`CategorieBadges.jsx`** — badges partagés (NoteCard, NoteView) : nature (journal) puis
catégories dans l'ordre. **`noteVisual()`** (`hooks.js`) : la **1re catégorie** donne icône +
couleur (pastilles calendrier, matrices, chips) ; sans catégorie → nature / 📄.

**`NoteCard.jsx`** — compact : badges nature + catégories (max 3), **chips thèmes (multi)**, objets,
éléments, vignettes médias, chip Todoist. Prop `showDate`.

## Données étendues (V2.1)

Champ structuré par note (`jd_notes.donnees_etendues`, objet `{cle:valeur}`), dont la
**forme dépend du contexte** via des **schémas** (`jd_schema_donnees`, cf. `database.md` /
`api.md`).

- **Résolution + fusion (serveur)** : `server/lib/categories.js` — `pickSchema` (un
  contexte, une catégorie au plus ; pur, en mémoire) et `fusionSchemas` (une résolution par
  catégorie de la note, union des champs dédupliqués par `cle`, repli joker). Contexte :
  **objet principal** (`objet_principal_id`), 1er thème (`theme_id`, axe conservé mais plus
  exposé à la saisie), **catégories** (`jd_note_categorie`), nature. Tri : spécificité ↓,
  distance d'ancêtre ↑ (∞ sans axe hiérarchique), priorité objet > thème > catégorie/nature.
  Cache `schema_donnees_ids` (+ `schema_donnees_id` = 1er), recalculé au POST/PUT note et à
  chaque modification de schéma. **Validateur** `conflitCles` : une même `cle` doit avoir
  partout le même type/options/unité/échelle (sinon `409`), condition de la fusion.
- **`DonneesEtenduesForm.jsx`** — formulaire dynamique : rend les 8 types de champs
  (texte court/long, nombre, décimal, échelle en étoiles, liste, oui/non, date) ; plusieurs
  schémas fusionnés → **sections repliables par catégorie d'origine** (`_schema`) ; + section
  **« hors schéma »** (valeurs d'un autre contexte, conservées et éditables — aucune perte).
- **`NoteForm`** : résout le schéma **en direct** (`GET …/schemas-donnees/resolve`) au
  changement de contexte (`categorie_ids`) ; repli sur la saisie libre si aucun schéma. Bloc
  compact « déterminant : objet × catégories » + sélecteur d'objet principal **seulement s'il
  y a un choix**. Le « thème principal » n'est plus exposé (les interventions ne sont plus
  des thèmes). **`NoteView`** affiche le tableau **au-dessus du corps** (libellés/ordre,
  intertitres par schéma si fusion), masqué si aucune valeur.
- **`SchemaDonneesManager.jsx`** (page `/jourdoc/:wsId/schemas`, lien depuis Workspace ⚙️) —
  liste, éditeur de champs (types, unité, min/max, options, réordonnancement), activation, et
  **simulateur** de résolution (contexte avec **plusieurs catégories** → schémas fusionnés).
  Avertit si la catégorie choisie ne s'applique pas à la nature choisie.
- **Exploitation** : helpers partagés `donneesUtils.js` (`GROUPABLES`, `valeursDe`,
  `sousGroupes`, `champsSchemaCommun`, `filtrerParDonnee`). Bibliothèque : **tri / groupe /
  filtre** sur les types discrets (liste/échelle/oui-non), proposés seulement si le contexte
  filtré résout à un schéma unique. Calendrier : **filtre** par donnée (pas de tri/groupe :
  vue chronologique). Export : cf. Bibliothèque + `exportList.js`.

## Hiérarchies et éléments

**`HierarchyPicker.jsx`** — sélecteur hiérarchique avec recherche et navigation
clavier. Modes `single` / `multi`. Les valeurs sélectionnées s'affichent en **chips**
avec croix de retrait. Prop `filterMode` :
- `scroll` — défile jusqu'à la 1ère correspondance (liste complète) ;
- `filter` — réduit la liste aux seuls éléments correspondants.
Le mode effectif vient de `pickerMode` (réglage workspace, distinct mobile/desktop).
**Mobile (`useIsMobile`)** : en mode `multi`, une sélection **ferme** le dropdown (le
cas courant est un seul objet/thème ; rouvrir pour en ajouter reste un tap sur le
trigger). Le mode `single` fermait déjà dans tous les cas.

**`ObjetManager.jsx` / `ThemeManager.jsx`** — arbre inline (afficher, renommer,
ajouter enfant, changer de parent), import CSV. Le picker de parent reste en `scroll`.

**`ElementPicker.jsx` / `ElementManager.jsx`** — sélection plate avec création
inline ; fusion d'éléments (`/elements/merge`). Le refocus après sélection (pour
enchaîner la saisie) est réservé au **desktop** : sur mobile il rouvrait aussitôt le
menu (`onFocus` → `setOpen(true)`), empêchant toute vraie fermeture.

**`ElementFilterPicker.jsx`** — variante **filtre** des éléments : multi-select plat
(sémantique OR, sans hiérarchie ni direction), même habillage visuel que
`HierarchyPicker` (`.jd-picker`). Branché en Bibliothèque, Calendrier et fiche objet
(`ObjetDetail`), sur les éléments **présents dans le jeu de notes courant** (comme le
filtre thème de la fiche objet). Filtre purement client (les 3 endpoints notes
renvoient déjà `elements[]` via `withData`), persisté en URL (`ef=id,id…`) pour
Bibliothèque/Calendrier.

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
**Tout l'état de vue** (mode, période `anchor`, filtres objet/thème + direction) persisté
en URL via une synchro unique (`useSearchParams`, `replace`) → **retour propre** depuis une
note. Le filtre thème teste `note.themes.some(...)`. Swipe tactile. Le panneau « jour
sélectionné » liste les `NoteCard` du jour sous la grille. **Données étendues** : filtre par
donnée (si le contexte filtré résout à un schéma unique) qui restreint les notes de toutes
les grilles ; bouton **📤 Exporter** de la période filtrée (liste plate, tri date).

**`AnalyseView.jsx`** — 52 buckets hebdomadaires × N années. Filtres objet + thème +
**interventions** (catégories de portée journal, multi, « au moins une ») + nature,
**persistés en URL** (retour propre). Surlignage cross-année, marqueur semaine
courante. **Clic sur une case** → popup d'aperçu (`createPortal`) **+ panneau de fiches
`NoteCard` sous la grille** (comme le calendrier) : `/analyse` ne renvoyant que des notes
minimales, les notes **enrichies** de la semaine sont récupérées à la volée via `/notes`
(bornées sur les dates du bucket, filtrées par ids). Pleine largeur (`jd-main--wide`).

## Bibliothèque

**`BibliothequeView.jsx`** (`/bibliotheque`) — parcours de toute la documentation
du workspace, **groupée en étagères par catégorie** (« Apports »). Un document apparaît
sur **toutes** les étagères de ses catégories : les compteurs ne sont **pas une partition**
(« 15 documents · 5 apports »), et la navigation précédent/suivant déduplique les ids. Charge `GET /notes?type=documentation`
(pas de route dédiée). Recherche (titre + titre_alt + contenu HTML détaggé), tri
(récent / A→Z), légende de catégories cliquables (chips colorées + compteurs, dont
« Sans catégorie »). **Densité** cartes / compact (persistée en `localStorage`).
**Filtres secondaires** objet + thème via `HierarchyPicker` + portée
ancêtres/descendants (`getRelated` avec `searchDepth`). Chaque étagère a un bandeau
coloré repliable + une grille de `NoteCard` (ou liste compacte). Tout est calculé
côté client (`useMemo`). **Filtres persistés en query params** (`useSearchParams`,
`replace`) → restaurés au retour depuis une note ; **position de défilement**
sauvegardée/restaurée via `sessionStorage` (conteneur `.jd-main`).

**Données étendues** (quand le contexte filtré résout à un schéma unique) : barre au-dessus
de la liste pour **trier / grouper / filtrer** sur les champs à valeurs discrètes (les
sous-groupes s'affichent au sein des étagères, avec intertitres).

**Export** (`ExportListModal` / `exportList.js`) — le ZIP contient `liste.html` (imprimable),
`liste.md` et **`liste.csv`** (+ dossier `medias/` optionnel). Depuis la Bibliothèque, la
modale reçoit une **structure de sections** (`sections=[{titre, ids}]`) → l'export **reflète
l'affichage** (catégories, sous-groupes, ordre, intertitres). Le **CSV** (`documentCsv`) a des
colonnes fixes (ID, titres, dates, type, catégorie, objets/éléments/thèmes joints par « | »,
auteur/source/référence, URL, liens IDs, nb pièces jointes) **+ une colonne par clé de donnée
étendue** (schéma puis hors-schéma) ; virgule + guillemets, BOM UTF-8. L'Analyse et le
Calendrier passent une liste plate d'`ids` (tri par date). Téléchargement médias en pool de
concurrence 8, images internes des `.md` rapatriées.

## Médias & stockage

**Préparation côté client** (`src/lib/imageUpload.js`, `prepareUploadFiles`) — *avant*
l'upload, pour contourner la limite de corps ~4,5 Mo de Vercel (`413
FUNCTION_PAYLOAD_TOO_LARGE`) :
- **HEIC/HEIF** (caméras récentes, indécodables par `<canvas>`) → conversion en JPEG via
  **`heic2any`** (chargé en **lazy chunk** ~1,3 Mo) ;
- **resize** `<img>`+canvas à 1600 px / q0.9 (même cible que le serveur → pas de double
  compression ; méthode `<img>` retenue car `createImageBitmap` gèle sur certains mobiles) ;
- la **date EXIF** est lue sur l'original (`exifreader`) **avant** re-encodage (qui efface
  l'EXIF) et transmise via le champ `dates[]` aligné sur `files[]`.
Branché sur les 3 points d'upload : NoteForm (collage + boutons 📷/🖼️), MediaGallery,
ShareTarget. Un HEIC non convertible (échec) est signalé (`undecodable[]`).

Upload : `POST /:wsId/medias` (multipart). Traitement serveur (imports dynamiques,
défense en profondeur) :
- **HEIC** → `heic-convert` d'abord (sharp ne supporte pas HEIC sur Vercel Lambda),
- **Date de prise** — priorité au **nom de fichier** (`dateFromFilename`, une date en tête
  ex. `20260804 …` est intentionnelle et fiable, y compris pour une capture d'écran datée
  du travail plutôt que de la capture), puis EXIF (client `dates[i]` puis serveur
  `exifreader`), puis `date_prise`/jour. **Images collées exclues** (`pasted` → pas de date
  de nom, on garde la date de la note). *Note : la conversion HEIC→JPEG serveur (sharp)
  perd l'EXIF/IPTC dans le fichier stocké — sans impact sur la date grâce à la priorité au
  nom, mais le géotag n'est pas conservé dans le JPEG.*
- Fichier envoyé sur **KDrive WebDAV** ; `jd_medias.fichier` = chemin WebDAV complet.

**MediaGallery** : galerie groupée par jour (date de prise), filtres type + liés/non liés
(serveur). Case **« tout sélectionner ce jour »** dans l'en-tête de groupe (sélection
respectant les filtres). Le scan inbox applique la même priorité nom → EXIF → jour.

**Module storage** (`packages/storage/index.js`) : `uploadFile`, `downloadFile`,
`listFiles`, `deleteFile`, `listInbox`, `moveFromInbox`. Le proxy
`GET /:wsId/medias/:id/file` télécharge depuis WebDAV et sert le binaire.
**Résolution des dossiers de workspace** (`resolveWsPath`) : en DB le segment ws est
toujours le **numéro** (`uploads/2/…`) ; juste avant l'appel WebDAV, le module traduit ce
numéro vers le **dossier réel** sur KDrive, ce qui autorise un dossier renommé par
préfixe numérique (`uploads/2 Modélisme/…`). Un dossier exactement numérique prime ; cache
5 min par base ; retours **canoniques** (DB inchangée, rename-safe). La queue de chemin
(sous-dossiers clipper/assets) est préservée.

**Inbox** (`server/routes/inbox.js`) : `GET /:wsId/inbox` liste, `POST /:wsId/inbox/scan`
importe les fichiers déposés (sous-dossier `WEBDAV_PATH_INBOX/{wsId}/`). Selon l'extension :
- **image / PDF** → traitement (HEIC, resize, EXIF) puis `uploads/{wsId}/`, média `photo`/`pdf` ;
- **`.zip`** (bundle MD + images, ex. export Notion) → **décompressé** dans
  `uploads/{wsId}/{uuid}/` en **préservant l'arborescence interne** (les liens d'images
  relatifs restent valides), un média `markdown` **géré** (non externe, éditable in-app)
  créé par fichier `.md` (`adm-zip`). Les **zips imbriqués** (export Notion = zip d'un
  `ExportBlock-…-Part-N.zip`) sont **dépliés récursivement en place** ; parasites macOS
  (`__MACOSX`, `.DS_Store`, `._*`) ignorés ; l'échec d'un asset n'annule pas le doc ;
- **`.md`** autonome → déplacé dans `uploads/{wsId}/`, média `markdown` géré.

**Images relatives d'un MD** (lié *ou* importé) : résolues à l'affichage **et** en édition
vers le proxy `GET /:wsId/medias/:id/relfile?rel=&t=` qui sert un fichier **relatif au
dossier réel du média** (`dirname(media.fichier)`), puis reconverties en chemins relatifs
au save (`unresolveImages`). Ce proxy unifie uploads et external (remplace l'ancien
`extdocs/file` + `base`).

**Fichiers liés (externes)** — pièces jointes par *référence* (sans copie) à un fichier
sous `WEBDAV_PATH_EXTDOCS/{wsId}/` (**scopé par workspace**). `ExtDocsBrowser` parcourt
l'arborescence (`GET /extdocs/tree`, racine = `extdocsRoot(wsId)` ; fichiers cachés `.`
masqués) ; clic sur un fichier → `POST /medias/link` ; bouton **＋ Nouveau document** →
`POST /extdocs/create` (crée un `.md` dans le dossier courant et le lie). **Images collées**
dans un MD → `POST /medias/:id/asset` qui les place dans `_<nomDoc>.assets/` à côté du `.md`
(plugin Milkdown `upload`), insérées en lien relatif vérifie l'existence par GET et crée un média `externe=true`
(MD, PDF, image…). L'original n'est jamais renommé/déplacé/supprimé (suppression =
détachement de la référence). Les MD liés sont **éditables in-app** (écrits dans le fichier
externe via `PUT /medias/:id/content`, sans renommage) : au rendu **et en édition**, les
**images relatives** sont résolues vers le proxy `medias/:id/relfile` (token frais) puis
**reconverties en relatif au save** (`unresolveImages`) ; **formules** via KaTeX
(`marked-katex-extension`). Ouverture directe d'une pièce jointe au clic sur sa vignette
(NoteCard : image/PDF → lightbox, markdown → MarkdownModal). Dépendances : `katex`,
`marked-katex-extension`.

**Documents Markdown** (`MarkdownModal.jsx`) — `type_media='markdown'`. Pièces jointes
`.md` (importées ou liées). Modal plein écran : visualiseur + **éditeur WYSIWYG
markdown-natif**. État unique = `md` (source).

- **Édition** = **Milkdown** (`MilkdownDocEditor.jsx`), pas Tiptap : son modèle interne
  **est** du markdown (remark), donc **aucun aller-retour** `marked`↔`turndown` (qui causait
  les divergences de dialecte). Composé `@milkdown/kit` (commonmark + gfm + history +
  listener) + `@milkdown/plugin-math` (KaTeX). Save = `getMarkdown()` (lecture directe).
  Chargé en **lazy chunk** (React.lazy) car lourd (~500 KB).
- **Collage** (`@milkdown/plugin-clipboard`) : Markdown collé → **interprété** en nœuds
  (plus de source brut), HTML collé → **converti** en markdown ; copie = markdown propre.
  Bouton **📋md** dans `MilkdownToolbar` (`insert()` de `@milkdown/kit/utils` après
  `navigator.clipboard.readText()`) — repli fiable sur mobile.
- **Vue lecture** = `mdToHtmlView(md)` de `mdConvert.js` (marked + KaTeX rendu + callouts +
  surlignage) → `RichTextView`. `mdConvert.js` ne sert plus QUE la vue (les fonctions
  `mdToHtmlEdit`/`htmlToMd`/`math.js` ne sont plus dans le chemin d'édition des docs).
- **Images à token** : le nœud `image` de Milkdown a un **nodeView** qui réécrit le `src`
  affiché vers le proxy `relfile` authentifié (`resolveSrc`), **sans** modifier le chemin
  relatif stocké dans le markdown → la source `.md` reste portable.
- **Listes** : nodeView `list_item` maison (le composant Vue officiel ne reflétait pas
  `checked`) — marqueur puce / numéro (compteur CSS) / **case à cocher cliquable** selon
  `listType`/`checked`. Conversion et bascule cocher = `toggle…ListCommand` qui mettent à
  jour les attrs des `list_item`. « Repasser en texte » (Tₓ/¶) étend la sélection à la liste
  externe puis boucle `liftListItem` (sous-listes incluses).

- **Toolbar** (`MilkdownToolbar.jsx`) : gras/italique/barré/surligné (+ pastilles couleur)/code,
  **effacer la mise en forme**, H1–H3 + **¶ (paragraphe)**, listes (puces/numéros/cocher),
  citation, bloc de code, ligne, **ligne vide ⏎**, **5 encadrés GitHub**, tableau (insérer +
  **ajouter/supprimer ligne·colonne**, supprimer table) — via `callCommand` (rendue dans le
  `MilkdownProvider`, `useInstance`).
- **Menu slash « / »** (`milkdownSlash.js`) : `slashFactory` + `SlashProvider` (matchNode
  élargi → s'ouvre aussi dans les titres), rendu/sélection maison (filtrage accent-insensible,
  nav ↑/↓/Entrée/Échap). Insère titres, listes (puces/numéros/**cocher**), citation, code,
  tableau, ligne, ligne vide, 5 encadrés. Configuré via `configureSlash(ctx)` dans `.config()`.
- **Surlignage couleur & callouts** (`milkdownExtras.js`) : `==texte==` / `==texte=={pink}`
  (markSchema, 5 teintes : jaune/rose/vert/bleu/orange) et `> [!NOTE|TIP|IMPORTANT|WARNING|
  CAUTION]` (nodeSchema, **5 alertes GitHub**, couleurs/icônes calquées). Chacun branche un
  `$remark` (parse via transform mdast + stringify via `toMarkdownExtensions`) → **round-trip
  markdown natif**. Commandes : `toggleBullet/Ordered/TaskList`, `setHighlightColor`,
  `clearFormatting`, `deleteRow/Column/Table`, `insertBlankLine`.
- **Mode source markdown** (`MarkdownModal`, bouton `</> Source`) : édition du `.md` brut en
  textarea (cas désespérés) ; retour visuel remonte Milkdown (`epoch`/`editBase`).
- **Édition de formule** : double-clic → prompt LaTeX (`handleDoubleClickOn` dans
  `MilkdownDocEditor` ; math inline = `textContent`, bloc = `attrs.value`).
- **Sauts de ligne & espacement** (le plus subtil — voir CLAUDE.md pièges 18-21) :
  `MilkdownDocEditor.cleanMd` retire les `<br />` du plugin `preserve-empty-line` (filtré du
  preset) et convertit les hardbreaks `\` en **deux espaces** ; le bouton **« Ligne vide »
  (⏎)** insère un paragraphe contenant un **vrai U+00A0** (pas d'HTML) via `replaceSelectionWith`
  (comme le séparateur) ; côté vue, `mdConvert.isolateNbsp` isole les lignes nbsp-seul en
  paragraphe autonome pour que marked les rende en espace visible.
- **Collage d'images → assets externes** : plugin `upload` Milkdown ; `uploadImage` envoie
  l'image dans `_<nomDoc>.assets/` (`POST /medias/:id/asset`, nom de dossier assaini) et
  insère un lien relatif ; repli base64 si doc non encore enregistré.

Contenu lu/écrit sur WebDAV (`GET`/`PUT /medias/:id/content`). Lecture/édition depuis
NoteView, MediaGallery et NoteCard ; exclu des lightbox/vignettes photo. Fermeture protégée
(confirmation si `dirty`). **Sommaire** repliable en vue lecture (`toc.js`). Dépendances :
`@milkdown/kit`, `@milkdown/react`, `@milkdown/plugin-math`, `@milkdown/plugin-clipboard`,
`katex` ; vue : `marked`, `marked-katex-extension`, `turndown` (collage HTML, sens unique).

`RichTextEditor` (éditeur des **notes** ; les docs `.md` utilisent Milkdown) : Tiptap
StarterKit (H1–H3), Underline, Link,
**TableKit** (tableaux redimensionnables + add/del lignes/colonnes), **TaskList/TaskItem**
(cases à cocher), **Image** (`@tiptap/extension-image` — images des MD éditables, sinon
supprimées à l'édition), **Highlight** (`@tiptap/extension-highlight` — bouton 🖍, `==…==`
en Markdown), **MathInline/MathBlock** (`math.js`, formules KaTeX), **slash-menu**
(`/`, extension `slashMenu.js` via `@tiptap/suggestion`),
mode source paramétrable (`htmlToSource`/`sourceToHtml` → Markdown dans le modal).
**Collage Markdown** : à la volée, si le presse-papiers ne contient que du `text/plain`
qui *ressemble* à du Markdown (`looksLikeMarkdown`, `src/lib/markdownPaste.js`), il est
converti en HTML riche (`marked`, GFM) et inséré ; si du HTML est présent, collage riche
natif préservé. Bouton explicite **📋md** (repli fiable sur mobile où l'événement `paste`
ne transmet pas toujours `clipboardData` → lecture via `navigator.clipboard.readText()`).
Barre d'outils **allégée sur mobile** (`<768px`) : les fonctions avancées
(`.rte-btn--adv`) sont masquées et accessibles via le slash-menu (bouton `＋`) — le bouton
📋md n'est **pas** `--adv` (visible sur mobile, là où il sert).
**Mentions `@`** (`mention.js`, `@tiptap/extension-mention`) : objets / thèmes / notes,
source fournie par la prop `mentionItems` (async, lue via une ref) ; l'`id` encode le
type (`objet:123`) ; clic sur une mention → navigation interne (géré dans NoteView).
Branché dans NoteForm (contenu) ; popup affiché seulement s'il y a des résultats.
**Callouts** (`callout.js`) : nœud bloc à variantes (info/tip/warning/success),
inséré via le slash-menu, icône + couleur en CSS. Round-trip Markdown complet via
`mdConvert.js` : alertes GFM `> [!TIP]` ↔ `div data-callout` (rendu **préservé** au
rechargement, dans les deux sens).
NB : les cases à cocher se sérialisent en GFM (`- [ ]`) ; côté documents Markdown,
le rechargement md→html peut les rendre en listes simples (limite `marked`).

## Todoist — plusieurs tâches par note

**Modèle.** Table de liaison `jd_note_todoist` (N tâches/note, **plafond 10**) = source
de vérité. Les colonnes `jd_notes.tache_todoist_*` restent comme **cache de la tâche la
plus urgente** (badge `NoteCard` + requêtes de liste **inchangées**). Helpers serveur
(`server/routes/jourdoc.js`) : `computeUrgence(due, priority)` et `refreshNoteTaskCache(noteId)`
appelés après chaque mutation/sync.

**Urgence** = `2 + P + D`. P = priorité API (1–4, 4 = max). D = bucket de délai :
dépassé 6, aujourd'hui 5, demain 3, 2–7 j 2, 8–14 j 1, > 14 j 0, **sans date 3** (les
flottantes P1/P2 restent visibles, P3/P4 partent en corbeille). Tri / badge = urgence ↓.

**`TodoistPanel.jsx`** (NoteView) — **liste** de tâches ; chacune : badge, priorité,
échéance, lien Todoist, actions (Terminer / Importer / Note de suivi / Délier / Supprimer)
via les routes `:taskRowId`. Bouton « + Ajouter une tâche » (créer / lier) tant que < 10.
`onNoteUpdated` pour re-fetch sans reload.

**`TodoistTasks.jsx`** (`/todoist-tasks`) — **1 ligne/tâche** (libellé = `content`), note
d'origine en contexte. Sections 🔔 À traiter / ⏳ En cours / ✅ Traités. « En cours » est
**filtrée à urgence > 7** (bouton « Voir tout » ; autres sections intactes) ; « Traités »
plafonnée aux **10 plus récents**.

**Sync batch** (`POST /:wsId/todoist/sync`) — boucle sur `jd_note_todoist` (non terminées),
détecte terminées / récurrentes / actives, recalcule l'urgence, rafraîchit le cache des
notes touchées. Rétro-compat : les routes note **sans** `:taskRowId` agissent sur la
tâche-cache.

## Référence

- Routes détaillées : `docs/dev/api.md`
- Schéma DB : `docs/dev/database.md`
- Auth : `docs/dev/auth.md`
- Architecture & déploiement : `docs/dev/architecture.md`
- Constantes de routes front : `packages/shared/src/index.js`
