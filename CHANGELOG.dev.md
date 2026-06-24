# Changelog développeur

Journal de bord des itérations. Entrées les plus récentes en tête. (numéros build remis à zéro en V2)

---

## Doc — 2026-06-24

Documentation à jour après le gros chantier éditeur Markdown : ajout de **10 pièges
Milkdown** dans CLAUDE.md (16-25 : round-trip remark, Crepe/Vue, preserve-empty-line,
hardbreaks `\`, U+00A0 vs `&nbsp;`, `replaceSelectionWith`, marqueurs de liste, math atomes,
lazy chunk, API composée), MAJ `docs/dev/jourdoc.md` (callouts GitHub, sauts de ligne/
espacement, collage assets) et de l'état de production.

---

## Build 67 — 2026-06-24

Bouton « Ligne vide » : insertion alignée sur le séparateur via `replaceSelectionWith`
(au lieu de toujours insérer après le bloc). Début de ligne → spacer **avant** ; entre deux
mots → **coupe la ligne** ; fin de ligne → après. Le spacer reste un paragraphe contenant
le vrai caractère U+00A0.

---

## Build 66 — 2026-06-24

Bouton « Ligne vide » revu : insère désormais un **paragraphe autonome** contenant le vrai
caractère espace insécable (U+00A0, pas d'entité HTML) — équivaut à [Entrée + Option+Espace
+ Entrée]. S'insère depuis n'importe où dans la ligne (comme le séparateur), curseur placé
sous le spacer, et **compatibilité étendue** (Typora reconnaît cette forme, pas le
hardbreak+nbsp). `insertBlankLineCommand`.

---

## Build 65 — 2026-06-24

Fix interligne « ligne vide » absent dans le **visualiseur** : marked colle le nbsp du
spacer au paragraphe précédent (via le saut dur) et le réduit à du blanc. `mdToHtmlView`
isole désormais les lignes ne contenant qu'un espace insécable en **paragraphe autonome**
→ marked rend `<p>&nbsp;</p>` (espace vertical visible, comme dans l'éditeur et Obsidian).
Marche pour les spacers manuels, du bouton, et hérités. Le `.md` n'est pas modifié.

---

## Build 64 — 2026-06-24

Fix `\` visibles des retours forcés : CommonMark sérialise les hardbreaks en `\` en fin de
ligne, et un `\` **isolé** (hardbreak seul dans un paragraphe) s'affiche littéralement dans
le visualiseur (marked) et les éditeurs externes. `cleanMd` convertit désormais ces `\` en
**deux espaces** (saut dur invisible et standard, rendu pareil partout), hors blocs de code.

---

## Build 63 — 2026-06-24

Bouton **« Ligne vide »** (toolbar ⏎ + slash) : insère un retour forcé (hardbreak) suivi
d'un **espace insécable** (= Shift+Entrée puis Option+Espace) → espacement vertical propre
et portable, sans `<br>` ni `\` visible. `insertBlankLineCommand`.

---

## Build 62 — 2026-06-24

**Fin des `<br />` dans le `.md`** (correctif à la source) : on retire le plugin
`remark-preserve-empty-line` du preset commonmark de Milkdown — c'est lui qui sérialisait
chaque paragraphe vide en `<br />`. Sans lui, l'éditeur produit du **markdown standard** :
les lignes vides multiples se comportent comme des séparations de paragraphes (portable
Obsidian/Typora). `cleanMd` reste en filet (retire les `<br />` hérités, compacte les
lignes vides). Le retour dur (Shift+Entrée) reste un saut CommonMark (`\`), volontaire.

---

## Build 61 — 2026-06-24

- **Nom du dossier d'assets assaini** : les caractères spéciaux (`#^[]|*\<>:?/` + espace)
  du nom de document sont remplacés par `_` (`_Mon_Doc.assets/`).
- **Plus de `<br />` dans le `.md`** : Milkdown sérialisait les lignes vides (paragraphes
  vides) en `<br />` (plugin preserve-empty-line) ; on les retire du markdown exporté
  (`cleanMd` sur onChange + getMarkdown) → fichier propre, lisible dans un éditeur externe.

---

## Build 60 — 2026-06-24

Retours docs/éditeur (5 points) :

- **Navigateur externe** : masque les fichiers/dossiers cachés (`.`) ; bouton
  **＋ Nouveau document** (prompt nom → `POST /extdocs/create` crée le `.md` dans le dossier
  courant + le lie).
- **Callouts harmonisés GitHub** : 5 standards **NOTE / TIP / IMPORTANT / WARNING / CAUTION**
  (mêmes noms + couleurs bleu/vert/violet/jaune/rouge). Variantes renommées partout
  (schema, toolbar, slash, vue lecture, CSS).
- **Gestionnaire média** : filtre de type → ajout de **Markdown**.
- **Collage d'images → assets externes** : plugin `upload` Milkdown ; image collée/déposée
  envoyée dans `_<nomDoc>.assets/` à côté du `.md` (`POST /medias/:id/asset`), insérée en
  **lien relatif** (affichage via proxy `relfile`). Repli base64 si doc non encore enregistré.

---

## Build 59 — 2026-06-23

Fix : transformer plusieurs lignes « normales » (hors liste) en cases à cocher ne cochait
que la 1re (les suivantes restaient des puces). `toggleTaskCommand` marque désormais
**tous** les `list_item` créés par l'enveloppement, pas seulement le premier.

---

## Build 58 — 2026-06-23

- **Délister les sous-listes** : nouvelle commande `flattenListCommand` qui **remplace la
  liste la plus externe par tous ses blocs à plat** (récursif). Tₓ/¶ l'appellent en boucle
  puis nettoient → les lignes indentées (niveaux > 0) repassent enfin en texte.
- **Cases à cocher agrandies** (`.jd-check` 1.4em).

---

## Build 57 — 2026-06-23

Listes Milkdown (suite) :

- **Cases à cocher rendues** : le composant Vue officiel ne reflétait pas l'attribut
  `checked` (case affichée en puce). Remplacé par un **nodeView `list_item` maison** :
  marqueur puce (•), numéro (compteur CSS auto), ou **case à cocher cliquable** (☐/☑) selon
  `checked`/`listType`. Vue retiré du bundle (chunk -120 KB). Item coché = barré.
- **« Repasser en texte » sur les sous-listes** : Tₓ/¶ étendent d'abord la sélection à la
  liste la plus externe puis délistent à fond (boucle `liftListItem`) → les lignes indentées
  sont aussi traitées.

---

## Build 56 — 2026-06-23

Listes Milkdown (retours #2/#3) — cause racine : le marqueur (puce/numéro/**case**) est
rendu par `listItemBlockComponent`, qui n'était **pas branché**, et dépend des attrs DU
`list_item` (label/listType/checked), pas du type de liste parent.

- **`listItemBlockComponent` branché** (`@milkdown/kit/component/list-item-block`, Vue
  bundlé) → cases à cocher rendues (corrige #3 : ça mettait des puces) + marqueurs corrects.
- **Conversion puces ↔ numéros** réécrite : met à jour le type de liste **et** les attrs de
  chaque `list_item` (label/listType), sur toute la sélection y compris **sous-listes** ;
  re-cliquer le même type délist. Plus besoin du double-clic enlever-puis-remettre (#2).
- **Liste à cocher** : bascule `checked` sur **tous** les `list_item` de la sélection.
- **Tₓ / ¶** sortent maintenant des listes (boucle `liftListItem`) puis marks + paragraphe
  → « convertir en texte simple » fonctionne (#2).
- CSS dédiée aux marqueurs du composant.

Limite restante : listes « lâches » (lignes vides entre items, attr `spread`) — à surveiller.

---

## Build 55 — 2026-06-23

Retours éditeur Milkdown (6 points) :

1. **Slash dans les titres** : `getContent` reçoit un `matchNode` élargi (tout textblock
   sauf bloc de code) → le menu « / » s'ouvre aussi dans un H1–H3.
2. **Conversion de listes** : `toggleBulletList`/`toggleOrderedList` convertissent
   puces ↔ numéros (setNodeMarkup) et basculent hors liste si déjà du même type.
3. **Liste à cocher** (`toggleTaskCommand`) : bascule l'attribut `checked` du `list_item`
   (GFM) ; bouton ☑ + entrée slash.
4. **Surlignage couleur** : 5 teintes (jaune/rose/vert/bleu/orange). Syntaxe markdown
   `==texte=={pink}` (round-trip validé en Node), pastilles dans la toolbar, classes CSS
   en éditeur **et** vue lecture.
5. **Mode source markdown** (bouton `</> Source`) : édite le `.md` brut dans un textarea
   pour réparer les cas désespérés, puis retour visuel (remontage Milkdown).
6. **Édition de formule** : double-clic sur une formule → prompt LaTeX
   (`handleDoubleClickOn`, math inline = textContent / bloc = attr value).

Plus : bouton **effacer la mise en forme** déjà présent, **¶ paragraphe**.

---

## Build 54 — 2026-06-22

Éditeur Milkdown — menu slash, callouts complets, effacer format, édition tableaux :

- **Menu slash « / »** (`milkdownSlash.js`) : `slashFactory` + `SlashProvider`, rendu et
  sélection maison. Filtrage par texte (accents ignorés), navigation ↑/↓/Entrée/Échap.
  Items : titres, listes, citation, bloc de code, tableau, ligne, **4 encadrés**.
- **Callouts : 4 variantes** (info/astuce/attention/succès) dans la toolbar ET le slash.
- **Effacer la mise en forme** (`clearFormattingCommand`) : retire les marks + repasse le
  bloc en paragraphe (enlève un titre). Boutons « T_x » et « ¶ ».
- **Édition de tableaux** : insérer/supprimer ligne, insérer/supprimer colonne, supprimer
  le tableau (gfm `addRow/ColAfterCommand` + prosemirror-tables `deleteRow/Column/Table`).

---

## Build 53 — 2026-06-22

Habillage de l'éditeur Milkdown + recâblage surlignage/callouts (markdown-natif) :

- **Toolbar** (`MilkdownToolbar.jsx`) : gras, italique, barré, surligné, code, H1–H3,
  listes, citation, **encadré**, bloc de code, tableau, ligne — dispatch via `callCommand`.
- **Surlignage `==texte==`** : mark Milkdown dédié (`milkdownExtras.js`) avec remark
  parse/stringify (round-trip validé en Node) + input rule + commande. Rendu `<mark>`.
- **Callouts `> [!TIP]`** : nœud Milkdown `callout` (variantes info/tip/warning/success)
  avec remark parse/stringify ↔ alertes GFM, rendu `div.jd-callout` (CSS existant).
- Tout reste **markdown-natif** : ces constructions round-trippent sans conversion HTML.

Reste à faire (optionnel) : menu slash « / » pour insérer blocs/formats.

---

## Build 52 — 2026-06-22

**Migration de l'éditeur des docs Markdown liés vers Milkdown (markdown-natif).**
Fin des allers-retours `marked`↔`turndown` (source de friction : dialectes divergents,
règles faites main par construction). Le modèle interne de Milkdown **EST** du markdown
(remark) → ce qu'on enregistre = ce qu'on a tapé, sans conversion.

- `MilkdownDocEditor.jsx` : composé `@milkdown/kit` (commonmark + gfm + history + listener)
  + `@milkdown/plugin-math` (KaTeX). Chargé en **lazy chunk** (~500 KB) — uniquement à
  l'ouverture d'un doc en édition.
- **Images à token** : nodeView du nœud `image` réécrit le `src` affiché vers le proxy
  `relfile` authentifié, **sans toucher** au chemin relatif stocké dans le `.md`.
- `MarkdownModal` : édition = Milkdown, save = `getMarkdown()` (plus de turndown ni
  `unresolveImages`). Vue lecture inchangée (marked+KaTeX). **Notes inchangées** (Tiptap).
- PWA : `maximumFileSizeToCacheInBytes` relevé à 4 MiB (chunks Milkdown/KaTeX).

Limites connues (suivi) : le surlignage `==…==` et les callouts `> [!TIP]` ne sont pas
encore *stylés dans l'éditeur* Milkdown (préservés dans le fichier + rendus en vue lecture).

---

## Build 51 — 2026-06-22

Tableaux MD (suite) : le build 49 ne suffisait pas — la détection d'en-tête de
turndown-plugin-gfm reste trop fragile (gardait des tableaux en HTML brut). Désormais on
**sérialise les tableaux nous-mêmes** (`extractTables`/`tableToGfm` dans `mdConvert.js`) :
chaque `<table>` est remplacé par un jeton puis converti en GFM (1re ligne = en-tête,
cellules via turndown inline aplati). Indépendant de la détection d'en-tête → tableaux
toujours en pipes éditables, avec/sans en-tête, gras/liens/maths/surlignage préservés.

---

## Build 50 — 2026-06-22

**Hotfix page blanche sur la vue d'une note.** Régression du build 48 : `useSwipe`
(un hook) était appelé **après** les `return` conditionnels (`if (loading)…`, `if (!note)…`)
de `NoteView`. Au chargement, le nombre de hooks variait entre deux rendus → React plantait
(« Rendered more hooks than during the previous render ») → page blanche. Hook remonté
**avant** tout return. (CalendarView/JourDocJournal/Lightbox n'étaient pas touchés : pas de
return avant leur `useSwipe`.)

---

## Build 49 — 2026-06-22

Fix tableaux en document Markdown : ils étaient sérialisés en HTML (donc non éditables
hors de l'app). Causes : Tiptap emballe le contenu des cellules dans `<p>` (retours ligne
qui cassent le tableau GFM → turndown le gardait en HTML) et turndown-plugin-gfm laisse en
HTML brut tout tableau **sans ligne d'en-tête**. Correctif `normalizeTablesForMd` (dans
`htmlToMd`) : aplatit les cellules (retrait des `<p>`) et promeut la 1re ligne en en-tête
`<th>` si aucune n'existe → tableaux GFM propres (`| … | … |`), formatage inline préservé.

---

## Build 48 — 2026-06-22

Swipe mobile — fin des navigations accidentelles :

- **Hook `useSwipe`** (`hooks.js`) : ne déclenche que si le geste est franchement
  horizontal (`|dx| ≥ 60` **et** `|dx| ≥ |dy|·2`), sinon c'est un scroll vertical.
  Ignore le multi-touch. Appliqué à JourDocJournal (jour ±1), CalendarView (période),
  NoteView (note ±1) et Lightbox (image ±1).
- **Overlays ne fuient plus le geste** : Lightbox et MarkdownModal **stoppent la
  propagation tactile** → un swipe dans une image/un doc ouvert depuis la liste ne
  navigue plus la liste en arrière-plan (le bug bubbling via portal React). La Lightbox
  faisait même double navigation (image + note) — corrigé.

---

## Build 47 — 2026-06-22

Éditeur Markdown — formules, callouts, surlignage :

- **Formules KaTeX préservées à l'édition** (corrige `$a=b+c^2$` → `a=b+c2a=b+c^2a=b+c2`).
  Avant, le HTML KaTeX rendu entrait dans Tiptap qui l'aplatissait en texte. Désormais
  les formules sont des **nœuds atomiques** (`math.js`, inline + bloc) : la source LaTeX
  vit dans `data-latex`, KaTeX est rendu dans un NodeView, double-clic pour éditer. Round-trip
  md↔html garanti (testé : indices, `\frac`, blocs `$$`, faux positifs `5$` ignorés).
- **Callouts rendus** : les alertes GFM `> [!TIP]` du Markdown sont converties en
  `div data-callout` (vue + éditeur), plus seulement à l'enregistrement.
- **Surlignage** (`@tiptap/extension-highlight`) : bouton 🖍 dans la barre d'outils ;
  round-trip Markdown `==texte==` ↔ `<mark>`.
- Conversion md↔html centralisée dans `mdConvert.js` (vue = KaTeX rendu ; édition =
  placeholders ; `htmlToMd` avec règles math/callout/highlight).

---

## Build 46 — 2026-06-22

Fix overlay pièce jointe depuis la NoteCard : la lightbox / le MarkdownModal
s'ouvraient dans un cadre tronqué recouvrant la liste, avec clignotement au survol.
Cause : `.jd-note-card:hover { transform }` crée un *containing block* qui piège le
`position: fixed` des overlays (rendus en enfants de la carte). Correctif : les overlays
sont désormais **portés sur `document.body`** (`createPortal`) → `fixed` relatif au
viewport. Clics toujours confinés (`stopPropagation`, les events React traversent le portal).

---

## Build 45 — 2026-06-22

Bundles Notion = zip imbriqué :

- **Zips imbriqués dépliés** : un export Notion est un `.zip` contenant un autre `.zip`
  (`ExportBlock-…-Part-N.zip`). `collectZipFiles` aplatit récursivement les zips internes
  *en place* (sans préfixer leur nom) → l'arborescence réelle (et les liens d'images
  relatifs) est conservée. Corrige l'erreur « sans .md » sur les exports Notion.
- **Détail des erreurs de scan** affiché dans le message (fichier — cause), au lieu d'un
  simple compteur opaque.

---

## Build 44 — 2026-06-22

Corrections retours test bundles (D) :

- **Parasites macOS ignorés** dans les `.zip` (`__MACOSX/`, `.DS_Store`, `._*`, `Thumbs.db`).
- **Bundles Notion robustes** : l'upload de chaque entrée est isolé — l'échec d'un asset
  n'annule plus tout le bundle (le média markdown est créé, assets en échec listés en
  `warnings`). Message d'erreur clarifié si aucun `.md`.
- **Images dans l'éditeur** : ajout de l'extension Tiptap `@tiptap/extension-image`
  (les `<img>` des MD étaient supprimés à l'édition). CSS responsive (`max-width:100%`).

---

## Build 43 — 2026-06-22

Import de bundles depuis l'inbox + dossiers externes par workspace :

- **EXTDOCS par workspace** : les fichiers liés sont désormais scopés sous
  `external/{wsId}/` (tree / link / file). `extdocsRoot(wsId)` côté serveur.
- **Proxy image relatif au média** `GET /medias/:id/relfile?rel=&t=` : sert un fichier
  relatif au **dossier réel** du média (uploads OU external). Unifie la résolution des
  images des MD, où qu'ils soient. `MarkdownModal` (resolve/unresolveImages) ne dépend
  plus de `base`/`extdocs/file` mais de `mediaId` + relfile.
- **Inbox — bundles .zip (MD + images)** : décompressés dans `uploads/{wsId}/{uuid}/`
  (arborescence interne préservée → liens d'images intacts) ; un média markdown **géré**
  (non externe, éditable in-app) créé par fichier `.md` du zip.
- **Inbox — .md autonome** → déplacé dans `uploads/{wsId}/` comme média markdown géré.
- Dépendance : `adm-zip`.

---

## Build 42 — 2026-06-21

Suite docs liés (retours terrain) :

- **Retrait** du bouton « + Document » (création MD in-app) — redondant avec la liaison.
- **Édition in-app des MD liés** : le doc lié devient éditable (WYSIWYG + source), écrit
  dans le fichier externe via `PUT content` (sans renommage). Images résolues à l'affichage
  en édition et **reconverties en chemins relatifs au save** (`unresolveImages`) → liens
  d'images préservés dans le `.md`.
- **Ouverture directe d'une pièce jointe** au clic sur sa vignette dans la NoteCard :
  image/PDF → lightbox, markdown → MarkdownModal, sans ouvrir la note. Overlays confinés
  (stopPropagation) pour ne pas naviguer.

---

## Build 41 — 2026-06-21

MediaDetail : aperçu des médias **markdown** (icône 📝 + « Ouvrir » → MarkdownModal)
au lieu d'une `<img>` cassée. Les pages de média lié (clic icône lien dans la galerie)
s'affichent correctement.

---

## Build 40 — 2026-06-21

Fix image cassée dans les MD liés : la route `medias/:id/content` calculait le
dossier `base` avec la variable d'env **brute** (tab parasite) alors que `fichier`
est stocké nettoyé → `startsWith` échouait → `base` vide → image cherchée au mauvais
endroit. Utilise désormais le helper trimmé `EXTDOCS()`.

---

## Build 37 — 2026-06-21

WebDAV : **compte propriétaire** (`apps@pogil.ch`) au lieu du compte en partage →
le PROPFIND (listing) fonctionne enfin à tous les niveaux. Conséquences :

- **Navigateur d'arborescence restauré** dans « 🔗 Lier » (au lieu de la saisie de
  chemin) — on parcourt `external/` et on clique le fichier.
- **Images Markdown** : décodage du `%20` (exports type Notion) avant résolution vers
  le proxy `extdocs/file` → images affichées. Formules `$…$`/`$$…$$` OK.
- (L'inbox scan redevient également fonctionnel, même cause.)

⚠️ Vercel : mettre à jour `WEBDAV_USER`=`apps@pogil.ch`, `WEBDAV_PASSWORD` (compte
propriétaire) **et** `WEBDAV_PATH_EXTDOCS`.

---

## Build 36 — 2026-06-21

Documents liés — adaptation à une **limite WebDAV** : sur le partage Infomaniak,
le PROPFIND (listing/stat/exists) renvoie **404** ; seul l'accès fichier direct (GET)
fonctionne. Le navigateur d'arborescence devient donc une **saisie du chemin relatif**
(sous `external/`). La route `link` vérifie l'existence par **GET** au lieu de `stat`.
Piège documenté dans CLAUDE.md (#14) — concerne aussi l'inbox scan, inopérant tel quel.

---

## Build 35 — 2026-06-21

**Documents liés (externes) — Phase 1.** Pièces jointes par *référence* à un fichier
sous `WEBDAV_PATH_EXTDOCS` (dossier `external`), sans copie ni déplacement.

- DB : migration `008` → `jd_medias.externe`.
- Backend : `storage.listDir` ; `GET /extdocs/tree` (arborescence) ; `POST /medias/link`
  (lier MD/PDF/image…) ; `GET /extdocs/file` (proxy borné + assaini) ; `/medias/:id/content`
  renvoie `base`/`externe` ; la suppression d'un média lié ne touche pas l'original.
- Front : `ExtDocsBrowser` (navigateur de dossiers) + bouton « 🔗 Lier » dans NoteForm.
  `MarkdownModal` : docs liés en **lecture seule**, **images relatives résolues à la volée**
  (proxy `extdocs/file` + token), **formules KaTeX** (`marked-katex-extension`). PDF/images
  liés via le proxy média existant.
- Dépendances : `katex`, `marked-katex-extension`.

⚠️ À faire côté infra : ajouter `WEBDAV_PATH_EXTDOCS` dans les variables Vercel.

---

## Build 34 — 2026-06-21

NoteCard : les **thèmes** quittent le bandeau du haut (saturé par les badges
catégorie + statut) pour rejoindre la rangée de chips **sous le titre**, après
objets et éléments (ordre éditeur : Objets → Éléments → Thèmes). Chips thème
cliquables (→ page thème), nouvelle teinte `jd-chip--theme`.

---

## Build 33 — 2026-06-21

Fix navigation « Retour » autour de l'éditeur de note : l'éditeur restait dans la
pile d'historique. Désormais `replace` partout — NoteView « Modifier » remplace la
vue, NoteForm enregistrement/annulation reviennent en lecture sans empiler l'éditeur.
Résultat : depuis la note enregistrée, un seul « Retour » ramène à la page d'origine.
Le contexte précédent/suivant (`noteIds`) est conservé à travers l'édition.

---

## Build 32 — 2026-06-21

Sélecteur de couleur amélioré (`ColorField`, `react-colorful`) : pastille ouvrant
un popover avec **carré saturation/luminosité + barre de teinte** (cible 2D),
nuances prédéfinies et saisie hex. Remplace l'`<input type=color>` natif dans le
gestionnaire de référentiels (catégories + statuts de doc).

---

## Build 31 — 2026-06-21

Fix surbrillance des chips neutres de la Bibliothèque (Tous/Toutes, Sans statut,
Sans catégorie) : la classe `.active` ne faisait qu'un léger halo → fond plein
accent. Les chips colorées gardent leur couleur (style inline prioritaire).

---

## Build 30 — 2026-06-21

Fix : le filtre par statut de la Bibliothèque ne s'appliquait pas (`selStatut`
manquait dans les dépendances du `useMemo` des étagères).

---

## Build 29 — 2026-06-21

Bibliothèque : **filtre par statut** (chips colorées + compteurs, « Sans statut »),
en plus du filtre par catégorie. Persisté en URL (`st`). Le filtrage des étagères
combine catégorie × statut × objet × thème × recherche.

---

## Build 28 — 2026-06-21

**Statuts de documentation gérables par workspace** (comme les catégories) :

- DB : migration `007` → référentiel `jd_doc_statut` (nom, icône, couleur, ordre),
  `jd_notes.doc_statut_id` (FK SET NULL) remplace la colonne texte `doc_statut`.
  Reprise des valeurs existantes ; seed Brouillon/Validé/Obsolète par workspace.
- Backend : CRUD `/:wsId/doc-statuts` ; notes POST/PUT `doc_statut_id` ; payloads
  exposent `doc_statut {nom,icon,couleur}` (withData, detail, search). Export enrichi.
- Front : `useJdData` charge `docStatuts` ; NoteForm sélectionne le statut depuis le
  référentiel ; NoteView/NoteCard affichent l'objet `doc_statut`. **Composant de
  gestion généralisé** `BadgeRefManager` (utilisé pour catégories ET statuts ;
  `DocCategorieManager` supprimé). Section « 🏁 Statuts de documentation » dans la
  page Workspace (ordre + couleurs personnalisables).

---

## Build 27 — 2026-06-19

**Documentation enrichie** : trois champs propres aux notes de type documentation.

- DB : migration `006` → `jd_notes.doc_auteur`, `doc_statut`, `doc_reference`.
- Backend : POST/PUT acceptent et stockent ces champs (NULL pour le journal).
  Lecture via `n.*` (déjà incluse).
- Front : NoteForm affiche (type=documentation) Auteur/source, Date de référence/
  version, et un Statut segmenté (✏️ Brouillon / ✅ Validé / ⚠️ Obsolète / Aucun).
  NoteView : badge de statut dans l'en-tête + bloc sidebar « 📚 Documentation »
  (auteur, référence). NoteCard : badge de statut. Helpers `DOC_STATUTS` / `docStatut`.

---

## Build 26 — 2026-06-19

Fix popup de mention `@` : l'icône des notes était codée en dur (📔). Elle est
maintenant calculée par `noteVisual(n)` → reflète la vraie nature/type/catégorie
(💡 conseil, ⚡ activité, 👁 observation…).

---

## Build 25 — 2026-06-19

Catégorie de doc aussi dans les **chips de notes liées** : `NoteLienChip` (NoteForm)
et `ChainChip` (fil de notes, NoteView) passent par `noteVisual`. Les requêtes de
liens du `GET /notes/:id` renvoient désormais `doc_categorie` (json_build_object),
donc les liens existants affichent l'icône de leur catégorie (plus seulement le 📄).

---

## Build 24 — 2026-06-19

**Catégorie de doc affichée partout** : helper `noteVisual(note)` (hooks.js) centralise
icône + couleur d'une note en tenant compte de la catégorie de documentation. Utilisé
dans le calendrier (mois, année, semaine/7j, matrice) et la recherche/liens de notes
(NoteLinkPicker) → les notes de doc affichent l'icône/couleur de leur catégorie au lieu
du générique 📄. Pastilles du calendrier passées en couleur inline (support des couleurs
arbitraires du référentiel).

---

## Build 23 — 2026-06-19

Table des matières étendue au **contenu des notes** (NoteView), en plus des
documents Markdown : sommaire repliable (`📑`) à partir de 3 titres, réutilise
`toc.js` + le style `.md-toc`. Scroll fluide vers la section.

---

## Build 22 — 2026-06-19

**Table des matières** (phase 5) : dans le visualiseur de document Markdown, un
sommaire repliable (`📑 Sommaire`) est généré depuis les titres (h1–h3) — `toc.js`
ajoute un id à chaque titre et renvoie la liste cliquable (scroll fluide vers la
section). Affiché à partir de 2 titres.

---

## Build 21 — 2026-06-18

**Callouts / encadrés** (phase 3) : nœud Tiptap custom (`callout.js`) à 4 variantes —
ℹ️ Info, 💡 Astuce, ⚠️ Attention, ✅ Succès — insérables via le slash-menu. Bordure
colorée + icône (CSS), rendu en édition et en lecture (RichTextView). Dans les
documents Markdown, sérialisés en alertes GFM (`> [!TIP]`) via une règle `turndown`
(contenu préservé ; le rendu encadré n'est pas régénéré au rechargement md).

---

## Build 20 — 2026-06-18

**Mentions `@`** (phase 2) : dans le contenu d'une note, taper `@` propose objets,
thèmes et notes (recherche), insère une mention colorée cliquable qui **navigue**
vers l'objet / thème / note (`mention.js` + `@tiptap/extension-mention`).

- Source via prop `mentionItems` (async, ref) ; `id` encode le type (`objet:123`).
- Navigation au clic gérée dans NoteView (parse `type:id`).
- Popup affiché uniquement s'il y a des résultats (un `@` d'email n'ouvre rien).
- Branché dans l'éditeur de note ; pas (encore) dans les documents Markdown
  (sérialisation md des mentions à définir).

Dépendance : `@tiptap/extension-mention`.

---

## Build 19 — 2026-06-18

Fix éditeur :

1. Bouton `＋` (slash) : réduit la sélection avant d'insérer « / » → le texte
   sélectionné n'est plus remplacé.
2. **Citation** : ajout du style CSS `blockquote` (bordure gauche + retrait) — la
   citation était bien appliquée mais invisible (aucun style).

---

## Build 18 — 2026-06-18

Éditeur — Phase 1 des compléments Tiptap (stratégie mobile : barre allégée + slash-menu) :

- **Slash-menu `/`** (`slashMenu.js`, `@tiptap/suggestion`) : titres, listes, cases à
  cocher, tableau, citation, bloc de code. Recherche + navigation ↑↓/Entrée/Échap.
  Bouton `＋` dans la barre pour l'ouvrir (utile mobile).
- **Cases à cocher** (TaskList/TaskItem), sérialisées GFM (`- [ ]`).
- **Barre d'outils responsive** : sur mobile (`<768px`), les boutons avancés
  (`.rte-btn--adv` : barré, code, H3, tableau…) sont masqués → accessibles via le slash-menu.

Dépendances : `@tiptap/suggestion`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`.

À venir : mentions `@`, callouts, collage d'images, table des matières, formules.

---

## Build 17 — 2026-06-18

Éditeur enrichi (notes + documents Markdown) :

1. **Protection contre la fermeture accidentelle** du modal Markdown : clic backdrop
   sécurisé (ignore les drags de sélection qui débordent), Échap et croix passent
   par une **confirmation si modifications non enregistrées** (état `dirty`).
2. Icône du bouton **bloc de code** corrigée (`{ }` était une expression JSX vide).
3. **H3**, **tableaux** (insertion + add/del lignes/colonnes, redimensionnables) via
   `@tiptap/extension-table` (TableKit). Aller-retour Markdown des tableaux assuré
   par `turndown-plugin-gfm` (+ `marked` GFM). Styles de tableaux (éditeur + vues).
4. `RichTextEditor` : `StarterKit` headings `[1,2,3]`.

Dépendances : `@tiptap/extension-table`, `turndown-plugin-gfm`.

---

## Build 16 — 2026-06-18

Corrections documents Markdown (retours terrain) :

1. Bouton **« 📝 + Document »** déplacé dans l'éditeur de note (NoteForm, à côté de
   « Choisir des médias ») ; retiré du visualiseur. Le doc créé est rattaché à la note.
2. **Mode source** : le textarea occupe toute la hauteur disponible (`flex: 1`).
3. **Mode source = Markdown** (et non HTML) : `RichTextEditor` accepte `htmlToSource`
   / `sourceToHtml` ; `MarkdownModal` y branche turndown / marked. Édition source
   en md, synchronisée avec le WYSIWYG.
4. **Vignette MD** corrigée dans NoteCard (icône 📝 au lieu d'une image cassée) ;
   idem dans la liste des médias sélectionnés de l'éditeur.

---

## Build 15 — 2026-06-18

**Pièces jointes Markdown.** Nouveau type de média `markdown` : on peut joindre
un document `.md` à une note (import ou création) et le visualiser / l'éditer en
WYSIWYG.

- DB/Backend : `.md` accepté à l'upload (`type_media='markdown'`) ; `POST
  /medias/markdown` (création) ; `GET`/`PUT /medias/:id/content` (lecture/écriture
  du texte sur WebDAV via `getTextFile`/`putTextFile`) ; mime `text/markdown`.
- Front : `MarkdownModal` plein écran — visualiseur (`marked` → `RichTextView`) et
  éditeur WYSIWYG (réutilise `RichTextEditor`/Tiptap ; sauvegarde `turndown` →
  md). Ouvert depuis NoteView (bouton « 📝 + Document » + clic sur une pièce
  jointe `.md`) et MediaGallery. `MediaCard` : branche markdown (icône). Markdown
  exclu des lightbox et des vignettes photo (NoteCard).
- Dépendances ajoutées : `marked`, `turndown`.

---

## Build 14 — 2026-06-18

Fix (bis) restauration du défilement de la Bibliothèque : au retour, le scroll
parasite vers 0 pendant le « Chargement… » écrasait la valeur stockée avant la
restauration. Désormais : **instantané de la position pris à l'initialisation** +
**sauvegarde suspendue tant que la restauration n'a pas eu lieu**.

---

## Build 13 — 2026-06-18

Fix restauration de la position de défilement de la Bibliothèque : le conteneur
scrollé n'est pas toujours `.jd-main` (parfois la fenêtre). Écouteur capturant sur
`window` (attrape aussi le scroll des descendants), lecture/écriture agnostiques
(`.jd-main` **ou** window), restauration avec ré-essais pour absorber le reflow
(chargement des vignettes).

---

## Build 12 — 2026-06-18

Bibliothèque — finitions :

1. **Persistance des filtres** : recherche, tri, catégorie et filtres objet/thème
   (+ portée) sont reflétés dans l'URL (`useSearchParams`, `replace`). Au retour
   depuis une note, les filtres sont restaurés. **Position de défilement** aussi
   sauvegardée/restaurée (`sessionStorage`, conteneur `.jd-main`).
2. **Alignement NoteCard** : bandeau supérieur en `align-items: flex-start` (le
   badge ne se décale plus quand le thème à droite passe sur 2 lignes — cas du
   badge « DOCUMENTATION » des docs sans catégorie). Thème aligné à droite.

---

## Build 11 — 2026-06-18

Bibliothèque enrichie :

- **Densité d'affichage** : bascule Cartes / Compact (liste à puce colorée +
  titre + objets/thèmes), préférence mémorisée en `localStorage`.
- **Filtres secondaires** objet + thème (`HierarchyPicker`) avec portée
  ancêtres/descendants (`↕/↓/↑`), réutilisant `getRelated` + `searchDepth`.

---

## Build 10 — 2026-06-18

**Bibliothèque** : nouvelle page `/bibliotheque` (nav 📚 Biblio) pour parcourir
toute la documentation du workspace, groupée en « étagères » par catégorie.

- Réutilise `GET /notes?type=documentation` (aucune route backend ajoutée).
- Recherche (titre + titre_alt + contenu), tri récent / A→Z.
- Légende de catégories cliquables (chips colorées + compteurs, « Sans catégorie »).
- Étagères à bandeau coloré repliable + grille responsive de `NoteCard`.
- Route + entrée de nav + composant `BibliothequeView.jsx` ; calcul 100 % client.

---

## Build 9 — 2026-06-18

Filtrage par catégorie de documentation dans ObjetDetail et ThemeDetail : un
sélecteur de catégorie apparaît dès qu'une note de doc catégorisée est présente
(avec option « — Sans catégorie »). Filtrage client sur `note.doc_categorie`.
Le sélecteur se masque et se réinitialise quand le filtre de type est mis sur
« Journal ». Catégories listées dans l'ordre du référentiel (`docCategories`).

---

## Build 8 — 2026-06-18

**Catégories de documentation.** Les notes de type « documentation » reçoivent une
sous-nature gérable (le journal garde observation/activité, intacts).

- DB : référentiel `jd_doc_categorie` par workspace (nom + emoji + couleur + ordre)
  + `jd_notes.doc_categorie_id` (FK `SET NULL`). Migration `005`, seed de 5 catégories
  par défaut (💡 Conseil, 📋 Descriptif, 📖 Manuel, 📐 Norme, ✨ Exemple) sur les
  workspaces existants et à la création.
- Backend : CRUD `/:wsId/doc-categories` ; notes POST/PUT acceptent `doc_categorie_id`
  (documentation only) ; les payloads de note exposent `doc_categorie {nom,icon,couleur}`
  (withData, GET note, search). Export enrichi (`doc_categories` JSON + CSV).
- Front : sélecteur « Catégorie » dans NoteForm (documentation) ; badges colorés
  (icône + couleur du référentiel) dans NoteCard et NoteView ; `DocCategorieManager`
  dans la page Workspace (ajout / renommage / emoji / couleur / réordonnancement /
  suppression avec compteur d'usage).

---

## Build 7 — 2026-06-17

1. **Titre alternatif** : cap porté de 2 à **3 noms** (sinon 3 premiers + « … »),
   pour objets et thèmes.
2. **Export complété** (oublis historiques) : ajout des tables de liaison manquantes
   `note_objets.csv`, `note_elements.csv`, `note_medias.csv` + le référentiel
   `elements.csv`. Le JSON embarque aussi `elements[]` par note et le référentiel
   `elements`. L'export est désormais complet (référentiels + toutes les liaisons).

---

## Build 6 — 2026-06-17

**Thèmes multiples par note.** Une note peut désormais être liée à plusieurs
thèmes (comme les objets). Calqué sur le patron `jd_note_objet`.

- DB : migration `004_note_theme_multi.sql` → table `jd_note_theme`
  (`ON DELETE CASCADE`), reprise des `theme_id` existants (30 liaisons migrées),
  index. `jd_notes.theme_id` **conservé** (legacy) et alimenté avec le 1er thème.
- Backend : `withData()` + `GET /notes/:id` renvoient `themes[]`. POST/PUT
  écrivent `jd_note_theme` (champ `theme_ids`, repli sur `theme_id`). Filtres
  passés en `EXISTS (jd_note_theme)` dans `/notes`, `/themes/:id/notes`, `/analyse`.
  Mapping `themes[]` ajouté à `/todoist/tasks`.
- Export : `themes[]` par note dans le JSON + nouveau `note_themes.csv` dans le ZIP.
- Front : picker thème en mode multi (chips), `NoteForm.theme_ids[]`. Affichage
  multi-chips dans NoteCard / NoteView / TodoistTasks. Filtres calendrier et
  ObjetDetail adaptés au tableau `themes[]`.
- **Générateur de titre** : titre complet = tous les noms ; titre alternatif
  (calendrier compact) = max 2 noms, sinon 1er suivi de « … » — pour objets ET thèmes.

---

## Build 5 — 2026-06-17

Fix alignement : le picker d'éléments démarrait plus à gauche que les pickers
objets/thèmes. Padding horizontal aligné sur `.input` (1rem) et bordure passée
à 1.5px pour cohérence visuelle complète.

---

## Build 4 — 2026-06-17

Améliorations ergonomiques de l'éditeur de note (retours terrain mobile) :

1. **Chips objets/thèmes** : les valeurs sélectionnées dans `HierarchyPicker`
   s'affichent désormais en chips (bordure + croix `×`), même look que le picker
   d'éléments. Retrait d'un choix en un clic sur la croix. Couleur accent pour
   distinguer des éléments (ambre). Nouvelles classes `.jd-picker__chip(s)`.
2. **Fond du picker d'éléments** aligné sur les autres champs (`--surface-alt`,
   `--surface` au focus).
3. **Ordre des champs** dans l'éditeur de note : Objets → Éléments → Thème.
4. **Champ Contenu redimensionnable** verticalement (poignée bas-droite) :
   `.rte-content` en `resize: vertical` (min 140px, max 75vh), ProseMirror en flex.

---

## Build 3 — 2026-06-17

Sélecteurs objets/thèmes (`HierarchyPicker`) : nouveau mode d'affichage **« Réduire »**
qui filtre la liste aux seuls éléments correspondants à la saisie, en plus du mode
historique **« Défiler »** (positionnement sur la 1ère correspondance, liste complète).
Le choix est un réglage de workspace, **distinct mobile / desktop** (breakpoint 768px),
modifiable dans la page Workspace. Défauts : mobile = `filter`, desktop = `scroll`
(comportement inchangé sur desktop). Appliqué aux 6 pickers de l'édition de note,
des filtres calendrier et de la page Analyse. Les sélecteurs de parent (Objets/Thèmes
managers) restent en `scroll`.

- DB : migration `003_add_picker_mode.sql` → colonnes `jd_picker_mode_mobile` /
  `jd_picker_mode_desktop` (TEXT) sur `workspaces`.
- API : `GET /:wsId` renvoie les 2 modes ; nouvelle route `PATCH /:wsId/picker-mode`.
- Front : `useJdData` résout `pickerMode` selon la largeur d'écran (`useIsMobile`,
  réactif via `matchMedia`) ; prop `filterMode` sur `HierarchyPicker`.

---

# Version 1 (pour mémoire)

## Build 92 — 2026-06-12

Fix HierarchyPicker : scroll sur recherche ne fonctionnait plus (build 91). Race condition React : `q` en dépendance du scroll effect déclenchait le scroll avant que `focusedIdx` soit mis à jour par le `setFocusedIdx` du cycle suivant. Fix : retrait de `q` des dépendances, le scroll est piloté uniquement par les changements de `focusedIdx`.

---

## Build 91 — 2026-06-12

Fix HierarchyPicker : le survol souris déclenchait un scroll automatique de la liste. Ajout d'un ref `scrollToRef` — le scroll n'est autorisé que si initié par clavier (↑↓) ou par changement de recherche. `onMouseMove` → `onMouseEnter` (survol met à jour la mise en évidence visuelle sans scroller).

---

## Build 90 — 2026-06-11

Fix MediaCard : boutons sans `type="button"` à l'intérieur du formulaire NoteForm déclenchaient une soumission du formulaire au clic (sélection d'un média = enregistrement immédiat de la note). Ajout `type="button"` sur les trois boutons (sélection, notes liées, suppression).

---

## Build 89 — 2026-06-11

(1) ws-switch desktop : position calculée via getBoundingClientRect au clic → menu positionné correctement sous le bouton (portal dans document.body = position:absolute inutilisable). (2) Triangles pli/dépli arbres ×1.5 : font-size 1.2→1.8rem, width/height 32→44px.

---

## Build 88 — 2026-06-11

Corrections éléments : (1) ElementPicker auto-géré (loadElements interne, refresh après création), champ inline style tag-input, Enter rapide (sélection si match unique sinon création). (2) Route GET /notes/:id inclut elements[]. (3) NoteCard : chips éléments inline avec les objets. (4) NoteView : section éléments visible. (5) ElementManager page dédiée (/elements), lien depuis WorkspaceManager.

---

## Build 87 — 2026-06-11

Item 6 — Éléments (tags plats non hiérarchiques sur les notes) : tables jd_elements + jd_note_element dans schema.sql. Routes CRUD + fusion (POST /elements/merge). withData enrichit les notes avec leurs éléments. ElementPicker.jsx : chips + dropdown filtré + création inline (Enter ou bouton). NoteForm, NoteCard, NoteView affichent et éditent les éléments. WorkspaceManager : liste éléments avec compteur notes, renommage inline, suppression si 0 notes, fusion multi-sélection → nom cible.

---

## Build 85 — 2026-06-11

Fix export CSV : archiver (CJS) causait Internal Server Error dans ESM Hono. Remplacé par makeZip() — générateur ZIP STORE pur Node.js, zéro dépendance, CRC32 intégré.

---

## Build 83 — 2026-06-11

Fix export CSV : Hono attend une Web ReadableStream, pas un PassThrough Node.js. ZIP bufferisé en mémoire via archive.on('data') + Buffer.concat avant c.body().

---

## Build 82 — 2026-06-11

Fix export : les <a href> ne transmettaient pas le token → Unauthorized. Remplacé par fetch() avec authHeader + URL.createObjectURL pour déclencher le téléchargement côté client.

---

## Build 81 — 2026-06-11

Items 1+2 phase v2 : (1) Export : route GET /:wsId/export?format=json|csv&medias=0|1 — JSON imbriqué complet, CSV ZIP (archiver), option avec médias. Boutons dans WorkspaceManager. (2a) Admin UserEditor : checkboxes accès apps, sauvegarde atomique création, mise à jour accès à l'édition. GET /admin/apps + GET /admin/users inclut app_ids. (2b) AppCard : si aucun workspace, formulaire de création inline au premier clic.

---

## Build 80 — 2026-06-10

Items 3/4/5 phase v2 : (3) maxDepth paramétrable — champ jd_search_depth sur workspaces, migration, route PATCH /search-depth, useJdData retourne searchDepth, getRelated accepte maxDepth, CalendarView et routes serveur (objets/notes, themes/notes, analyse) l'appliquent. UI dans WorkspaceManager (segmented 1/2/3/5/10). (4) Import CSV deux formats : boutons path/parent dans l'exemple, descriptions, chargement du bon exemple. (5) Éditeur enrichi : bouton Barré (Strike Tiptap), toggle code source HTML (textarea éditable + retour Tiptap).

---

## Build 79 — 2026-06-10

Documentation complète : CLAUDE.md (sections JourDoc, patterns, PWA, portal), docs/dev/architecture.md (refonte complète), docs/dev/database.md (nouveau, schéma complet + migrations), docs/dev/jourdoc.md (nouveau, composants, routes, patterns), docs/dev/api.md (toutes les routes). CDC-JourDoc.md : phasage mis à jour avec statut ✅, fonctionnalités hors-CDC, idées d'évolution.

---

## Build 78 — 2026-06-10

§2.7 confirmé existant. Polish+§7.3 : (1) TodoistPanel window.location.reload() → onNoteUpdated callback (re-fetch ciblé). (2) CalendarView swipe tactile sur tous les modes sauf matrice. (3) AnalyseView : surlignade colonne au clic (même semaine × toutes les années), marqueur semaine courante (outline accent), popup enrichi (plage dates semaine en header, dot nature + date exacte par note).

---

## Build 77 — 2026-06-10

Vue Analyse fixes : (2) Popup via createPortal(document.body) + position:fixed calculée au survol (échappe overflow-x:auto de .jd-analyse__wrap), gestion hover avec délai 150ms. (3) Contour table via outline:2px, border-right:1px entre semaines (border-collapse), --month-start inchangé.

---

## Build 76 — 2026-06-10

Vue Analyse retouches : (1) Documentation exclue systématiquement (AND n.nature IS NOT NULL). (2) Popup z-index 400 + z-index:10 sur cellule survolée (était masqué par les lignes suivantes). (3) Grille : border-bottom fin entre semaines, border-left épais aux transitions de mois (--month-start), alternance de fond pair/impair par ligne.

---

## Build 75 — 2026-06-10

§7.3 Vue Analyse pluriannuelle : tableau 1 ligne/année × 52 colonnes/semaines. Filtres HierarchyPicker objet+direction et thème+direction, nature (Tout/Obs./Act.). Header mois proportionnel. Cellules avec dots colorés par nature + popup au survol. Route GET /analyse côté serveur avec filtrage hiérarchique JS. .jd-main--wide pour la pleine largeur. Item "📊 Analyse" dans la nav.

---

## Build 74 — 2026-06-10

Lier tâche Todoist : après la liaison, poste un commentaire sur la tâche Todoist avec lien cliquable vers la note JourDoc (📔 Note JourDoc : [titre](url)). Erreur de commentaire silencieuse (la liaison reste valide).

---

## Build 73 — 2026-06-10

Fix extraction taskId Todoist : URL moderne = "nom-kebab-TASKID" → TASKID = dernier segment avec majuscules et ≥8 chars (ex. 6cVrwR54r6Jhmr69). Fallback = slug complet ou valeur brute.

---

## Build 72 — 2026-06-10

(1) ws-switch menu rendu via createPortal(document.body) — échappe définitivement overflow-x:auto et tout stacking context parent. CSS: position:fixed par défaut (mobile), position:absolute sur desktop. (2) todoist/link : affiche le taskId extrait dans le message d'erreur pour debug.

---

## Build 71 — 2026-06-10

Fix build 70 : (1) ws-switch menu z-index 50→300, backdrop 49→299 (menu derrière le contenu principal). (2) Route /todoist/link : outer try/catch + c.req.json() protégé + extraction ID plus robuste (split /task/ → dernière portion → strip query string).

---

## Build 70 — 2026-06-10

(1) Workspace switcher mobile : position:fixed pour échapper à overflow-x:auto de .jd-nav (menu clips). (2) TodoistPanel : bouton "🔗 Lier une tâche existante" — saisie URL ou ID Todoist, extraction de l'ID, vérification API, stockage tache_todoist_id + contenu + due + priority. Route POST /todoist/link côté serveur.

---

## Build 69 — 2026-06-09

Page Tâches : (2) 🔄 inline avant le titre (1rem, sans badge), visible même avec petite font-size. (3) Titre = tache_todoist_content (titre Todoist) avec fallback note.titre. Migration + stockage tache_todoist_content TEXT lors de la création et la sync.

---

## Build 68 — 2026-06-09

Retouches page Tâches Todoist : (1) Cartes arrondies avec hover accent (remplace liste plate à coins droits). (2) Symbole 🔄 sur les tâches récurrentes. (3) Affiche note.titre (plein) + thème + objets. (4) Section "✅ Traités" : après "Consigner", flag tache_todoist_consigne=1, tâche quitte "À traiter" → "Traités". Récurrentes : retour en "En cours" après consignation (comportement inchangé). Migration tache_todoist_consigne INTEGER DEFAULT 0.

---

## Build 67 — 2026-06-09

Corrections page Tâches Todoist : (1) Titre note remplace le bouton rectangulaire par jd-note-card__titre (style cohérent app). (2) Auto-sync throttle réduit 5 min → 1 min. (3) Import : HTML-escaping du titre de tâche et du contenu des commentaires Todoist (évite injection HTML brut). (4) Suivi : contenu pré-rempli avec lien <a> vers la note d'origine.

---

## Build 66 — 2026-06-09

Page "✓ Tâches" Todoist : route GET /todoist/tasks, composant TodoistTasks.jsx (sections À traiter / En cours), actions "↓ Consigner" et "✎ Suivi" inline. Détection tâches récurrentes : champ tache_todoist_recurrence_done, comparaison due date en sync. Auto-sync : ajout visibilitychange (retour au premier plan) + navigation automatique vers /todoist-tasks si d.completed > 0. Import remet recurrence_done à 0.

---

## Build 65 — 2026-06-09

Diagnostic sync Todoist : client affiche le message d'erreur réel (status HTTP + body ou exception) au lieu de "Erreur réseau" générique, pour identifier la cause de l'échec.

---

## Build 64 — 2026-06-09

Fix sync Todoist : try/catch global sur POST /todoist/sync — les erreurs non gérées retournaient une réponse vide (client voyait "erreur réseau"). Q4 : endpoint /details retourne task_content + task_id ; /import accepte task_title + task_id et les inclut dans le HTML ajouté (📌 lien cliquable vers la tâche Todoist).

---

## Build 63 — 2026-06-09

§6.4 Sync Todoist (A+B) : route POST /todoist/sync — batch check des tâches non complétées du workspace, mise à jour DB (done/due/priority). Sync silencieuse au montage de JourDocApp (throttlée 5 min via sessionStorage). Bouton "🔄 Sync maintenant" dans WorkspaceManager avec feedback (X tâches vérifiées, Y terminées) et horodatage de dernière sync.

---

## Build 62 — 2026-06-09

Fix §2.6 titre_alt : séparateur des objets corrigé de '/' en ', ' — le '/' est interne au nom_court d'un objet (ex. Pom/Gol), les objets sont séparés par ', ' comme dans le titre long (ex. Pom/Gol, Pru → TrAntif).

---

## Build 61 — 2026-06-09

(1) SW : ajout skipWaiting() + clientsClaim() — le nouveau service worker prend le contrôle immédiatement sans attendre la fermeture des onglets, ce qui corrige le build en retard dans le footer. (2) TopBar : logo "P" remplacé par icon-192.png (logo 4 couleurs).

---

## Build 60 — 2026-06-09

ObjetDetail + ThemeDetail : filtre par type de note — boutons segmentés Tout / 📔 Journal / 📄 Doc., aligné à droite sur la barre de contrôles. Appliqué après les filtres thème/objet existants.

---

## Build 59 — 2026-06-08

Vue annuelle : popup au survol identique à la vue mensuelle — 1ère ligne plage de dates (ex. "3 jan – 9 jan"), puis liste notes avec icône + titre court, navigation directe. CSS :hover réutilise les classes cal-cell__popup existantes.

---

## Build 58 — 2026-06-08

Vue annuelle + filtres calendrier : (1) CalendarYear.jsx — grille de semaines (lun→dim) par mois, puces de couleur, clic → notes de la semaine. weeksOfYear() dans calUtils. (2) Filtres objet et thème (HierarchyPicker) sur les vues mois et année, avec contrôle de portée ↕/↓/↑ activé dès qu'un filtre est sélectionné. getRelated() dans calUtils pour descendants/ancêtres. filteredNotes calculé avec useMemo.

---

## Build 57 — 2026-06-08

Fix ThemeDetail notes : route /:wsId/themes/:id/notes réécrite sans CTE SQLite (probable cause d'erreur silencieuse → 0 notes affichées). Calcul hiérarchique descendants/ancêtres en JS pur sur la liste des thèmes du workspace.

---

## Build 56 — 2026-06-08

Fix build 55 : (4) NoteCard date : champ note.date (pas date_note). (5) ThemeDetail : nouvelle route serveur GET /themes/:id/notes avec direction hiérarchique (CTE récursif descendants/ancêtres, maxDepth 5) + JD_THEME_NOTES dans shared + contrôle portée ↕/↓/↑ comme ObjetDetail + filtre objet en même ligne.

---

## Build 55 — 2026-06-08

6 retouches UX : (1) Swipe tactile sur la page journal (gauche/droite = jour suivant/précédent). (2) Toolbar mobile scrollable horizontalement au doigt (overflow-x auto, justify flex-start, items flex-shrink:0). (3) Arbres objets/thèmes : interligne réduit d'1/3 (padding .1rem, min-height 24px, toggle 32px). (4) NoteCard : prop showDate pour afficher la date — activée dans ObjetDetail et ThemeDetail. (5) ObjetDetail : filtre par thème (descendants inclus) ; ThemeDetail : filtre par objet (descendants inclus). (6) PDF viewer : Lightbox affiche iframe inline + lien "ouvrir dans nouvel onglet" ; NoteView inclut les PDFs dans la lightbox.

---

## Build 54 — 2026-06-06

Suppression complète du share target (fonctionnalité abandonnée) : ShareTarget.jsx, shareDB.js, ShareIntentDetector, routes serveur share-session/share-pending/debug/share, pendingSessions, POST /share-target, share_target du manifest, handler SW. Le serveur retrouve son état minimal.

---

## Build 53 — 2026-06-06

APK Bubblewrap : mise à jour assetlinks.json avec le fingerprint SHA-256 du keystore Bubblewrap (4C:6A:EC:6F:...). L'APK app-release-signed.apk généré sur ~/Desktop remplace le package PWABuilder.

---

## Build 52 — 2026-06-06

Diagnostic confirmé : POST /share-target n'arrive jamais sur le serveur (sessions_disk et sessions_memory vides). Ajout check IDB dans ShareIntentDetector : si le SW a intercepté le POST et stocké en IDB sans que le redirect ne cause une navigation, le polling le détecte et redirige vers /share-target?shared=1.

---

## Build 51 — 2026-06-06

Diagnostic + polling TWA share : endpoint GET /api/share-pending (session la plus récente < 5 min en mémoire), endpoint GET /debug/share (sessions disque + mémoire, temporaire). ShareIntentDetector passe en polling actif : toutes les 500ms pendant 10s au mount et à chaque visibilitychange, vérifie cookie ET /api/share-pending. pendingSessions Map côté serveur, nettoyée au DELETE et après 10 min.

---

## Build 50 — 2026-06-06

Fix TWA share target — cookie comme mécanisme de détection : la TWA Android navigue vers start_url (/) sans suivre le redirect 303 du POST. Le serveur pose maintenant un cookie share_session=<uuid> (Max-Age 1h) dans la réponse du POST /share-target. Nouveau composant ShareIntentDetector dans main.jsx (top-level, à l'intérieur du BrowserRouter) : détecte le cookie au mount ET sur visibilitychange, redirige vers /share-target?session=<uuid> quelle que soit la route courante. ShareTarget nettoie le cookie au cleanup (import ou annulation). Suppression du check IDB dans Portal (remplacé par la détection globale).

---

## Build 49 — 2026-06-06

Fix partage TWA Android cold start : le SW n'est pas actif au premier démarrage → le POST /share-target arrivait sur Hono sans handler → Chrome naviguait vers start_url (/). Ajout d'un handler POST /share-target côté serveur : sauvegarde les fichiers dans data/share-sessions/<uuid>/, redirige vers /share-target?session=<uuid>. Trois routes serveur supplémentaires : GET /share-session/:id/meta.json, GET /share-session/:id/file/:name, DELETE /share-session/:id. ShareTarget.jsx gère les deux chemins : session (serveur, cold start) et IDB (SW actif, warm start). Cleanup de session après import ou annulation.

---

## Build 48 — 2026-06-06

Fix partage TWA Android : quand l'app est déjà ouverte en arrière-plan, le redirect 303 du SW ne déclenche pas de navigation. Fix : (1) Portal.jsx vérifie IndexedDB au mount ET sur visibilitychange → redirige vers /share-target?shared=1 si fichiers en attente. (2) ShareTarget : charge les fichiers IDB dès que le token est présent (sans attendre ?shared dans l'URL) ; affiche le picker si files.length > 0 même sans paramètre URL.

---

## Build 47 — 2026-06-06

TWA assetlinks.json : fingerprint SHA-256 réel (DB:C1:55:...) généré par PWABuilder pour ch.pogil.apps / signing.keystore. L'APK pogil apps.apk peut être sideloadé sur Android.

---

## Build 46 — 2026-06-06

Préparation TWA/APK Android : route GET /.well-known/assetlinks.json (Digital Asset Links) liant apps.pogil.ch au package ch.pogil.apps. Le SHA256 fingerprint est un placeholder à remplacer après génération de l'APK via PWABuilder.

---

## Build 45 — 2026-06-05

Fix PWA Android (2e passe) : (1) Middleware Hono `/*.webmanifest` ne matchait pas `/manifest.webmanifest` — remplacé par une route GET dédiée lisant le fichier et forçant Content-Type application/manifest+json. (2) Le template index.html avait déjà `<link rel="manifest">` ET vite-plugin-pwa en injectait un second → manifest dupliqué ; suppression du lien du template (vite-plugin-pwa l'injecte seul).

---

## Build 44 — 2026-06-05

Fix PWA Android — installation vraie app au lieu de raccourci : (1) Middleware Hono pour servir manifest.webmanifest avec Content-Type application/manifest+json (Hono serveStatic pouvait envoyer octet-stream, Chrome ignorait silencieusement le manifest). (2) Génération d'une icône maskable dédiée (icon-maskable-512.png) : logo centré sur fond #0f0f1a avec 10% de marge (safe zone 80%) via sharp. (3) Manifest : champ id "/" ajouté pour identification stable de la PWA. Résout l'impossibilité de partager images/PDF avec l'app via le Share Target Android.

---

## Build 27 — 2026-06-04

Intégration Todoist (CDC §6) : migration DB (todoist_token/project_id/project_nom sur workspaces). 5 endpoints serveur proxy (config GET/PUT, projects POST, task POST/GET/DELETE). TodoistPanel.jsx : création tâche (titre=note, lien retour, échéance, priorité P1-P4, récurrence texte libre avec popup aide syntaxe), statut polling au chargement, délier/supprimer. NoteView : TodoistPanel dans la sidebar. WorkspaceManager : section Todoist (saisie token masqué, test+chargement projets, sélection projet, enregistrement). Tous les appels Todoist passent par le serveur (clé jamais exposée au client).

---

## Build 26 — 2026-06-04

Validation backlog C+E : (C) ObjetManager et ThemeManager déjà complets — éditeur inline arbre avec renommage, changement de parent (= insertion niveau intermédiaire), ajout enfant, suppression. (E) Nouveau mode "📋 7 jours" dans CalendarView : affiche les 7 derniers jours se terminant sur l'anchor (anchor = aujourd'hui par défaut), navigation par blocs de 7 jours via les flèches, réutilise CalendarWeek avec prop mode="last7". Ajout getRange/shiftAnchor/rangeLabel/daysOfLast7 pour le period "last7" dans calUtils.

---

## Build 25 — 2026-06-04

HierarchyPicker scroll : soustraction du offsetTop de la <ul> (l'offsetParent étant le dropdown positionné, el.offsetTop incluait la hauteur de la zone de recherche → item 2 lignes au-dessus du visible). Correction : scrollTop = el.offsetTop - listRef.offsetTop.

---

## Build 24 — 2026-06-04

HEIC (3e tentative) : ajout détection magic bytes — iOS envoie souvent du contenu JPEG avec extension .heic ; la détection (FF D8 → jpeg, ftyp → heif) permet de distinguer les deux cas et évite une conversion inutile. Pour les vrais HEIC, la chaîne reste sharp → heic-convert WASM → fallback. HierarchyPicker : scroll vers le haut du container (scrollTop = el.offsetTop) quand une recherche est active, au lieu de scrollIntoView nearest qui plaçait l'item en dernière ligne.

---

## Build 23 — 2026-06-04

Corrections post-test terrain (build 22) : (1) Fix crash NoteView page blanche — useRef placé après les early returns violait les règles des hooks React. (2) Vue semaine : clic sur une colonne jour affiche le panneau notes en dessous (même comportement que la vue mensuelle). (3) HEIC : ajout heic-convert (WASM) comme fallback quand sharp ne peut pas décoder HEIC. (4) Overlay médias mobile : @media pointer:coarse au lieu de hover:none, plus fiable sur iOS/Android. (5) HierarchyPicker : au lieu de filtrer, défile vers la première correspondance et surligne les items matchés en maintenant la hiérarchie complète visible.

---

## Build 22 — 2026-06-04

Sprint mobile/UX : (1) Fix timezone — toutes les fonctions de date locale utilisent désormais les méthodes getFullYear/getMonth/getDate au lieu de toISOString() UTC, corrige le recul de 2 jours sur les flèches journal et l'ancrage incorrecte de la vue semaine. (2) HEIC → JPEG : conversion automatique côté serveur via sharp, les images iPhone sont maintenant affichées partout. (3) Swipe mobile dans Lightbox (médias) et NoteView (navigation notes). (4) Vue semaine mobile : header compact, titres masqués, min-width 44px → utilisable en portrait. Dates centrées en paysage. (5) Overlay média toujours visible sur écrans tactiles (@media hover:none). (6) Filtre médias "Tous/Non liés/Liés" remplacé par boutons inline. (7) HierarchyPicker : items triés alphabétiquement par chemin hiérarchique complet.

---

## Build 21 — 2026-06-03

Import CSV objets + thèmes : backend parseur (BOM, séparateur ; ou , auto-détecté, commentaires #), format chemin hiérarchique (Arbres/Fruitiers/Pommiers) ou nom+parent, idempotent (doublons ignorés). Routes POST /import/objets et /import/themes. CsvImporter : upload drag&drop + coller, prévisualisation table, résultats (créés/existants). Section import dans WorkspaceManager avec onglets Objets/Thèmes et exemples chargeables.

---

## Build 20 — 2026-06-03

Gestion des workspaces : backend CRUD (créer, renommer PATCH, supprimer DELETE, membres GET/POST/PUT/DELETE, ownerCheck middleware). WorkspaceSwitcher dans la sidebar JourDoc (dropdown rapide, basculer d'un ws à l'autre). WorkspaceManager (⚙️ Workspace dans la nav) : renommer, supprimer ws courant, gérer les membres (inviter par username/email, changer rôle, retirer), créer un nouveau ws. Route /api/jourdoc/workspaces (non scoped).

---

## Build 19 — 2026-06-03

Navigation précédente/suivante dans NoteView : sortedIds() transmis via location.state depuis Journal, CalendarMonth (popup + panneau), CalendarWeek, ObjetDetail, ThemeDetail, ObjectMatrix. Tri date ASC + created_at ASC. NoteView lit noteIds, affiche position (n/total) et flèches ‹ / ›. Contexte préservé à chaque nav (replace:true). Backend : created_at ajouté à la requête objets/notes récursive.

---

## Build 18 — 2026-06-03

Ergonomie : NoteView lecture (2 colonnes desktop, médias lightbox, fil de notes, bouton Modifier). RichTextEditor Tiptap (gras/italique/souligné, code/bloc, puces/numéros indentables, H1/H2, lien). RichTextView (HTML + fallback texte brut). Calendrier URL-based state (useSearchParams → navigate(-1) restaure le contexte). Bouton "+ Note" depuis ObjetDetail (pré-remplit objet). NoteForm → NoteView après sauvegarde. Tri liens created_at.

---

## Build 17 — 2026-06-03

Fix fil de notes : permutation Contexte/Suite — liens sortants (notes citées, plus anciennes) → Contexte ; liens entrants (notes qui citent celle-ci, plus récentes) → Suite / entraîne.

---

## Build 16 — 2026-06-03

Liaisons notes : section "Fil de notes" visible dès la création (liens en attente créés après POST). Titre complet affiché dans chips et picker (titre_alt en secondaire). Couleur par type (observation=vert, activité=indigo, documentation=ambre) sur chips et items picker. Tri chronologique des liens (sortByDate).

---

## Build 15 — 2026-06-03

Liaison entre notes (CDC §2.3) : table jd_note_note. Backend : recherche plein-texte GET /notes/search, POST/DELETE /notes/:id/liens, liens entrants dans GET /notes/:id. NoteLinkPicker (recherche debounce, titre_alt affiché, date). Section "Fil de notes" dans NoteForm (edit seulement) : liens entrants en lecture, liens sortants modifiables, NoteLienChip cliquable + suppression immédiate.

---

## Build 14 — 2026-06-03

Fix vues calendrier : WeekNoteItem compact (icône + fond coloré + titre_alt, titre complet en tooltip). Popup hover CSS sur CalendarMonth (titre_alt, navigation directe vers la note, repositionnement colonnes droite). Matrice refaite en CSS Grid natif : colonne objet sticky left, header sticky top, coin sticky, scroll vertical + horizontal sans chevauchement, hauteurs de lignes uniformes (grid-auto-rows: 34px).

---

## Build 13 — 2026-06-03

Phase 2 Calendrier : CalendarView (conteneur avec 3 modes + nav période + compteur). CalendarMonth (grille 7×N, dots colorés par nature, clic jour → notes + bouton +). CalendarWeek (7 colonnes, NoteCard compact, + rapide par colonne). ObjectMatrix (matrice objets × jours, cellules colorées par activité dominante, popup clic → notes liées + nouvelle note pré-remplie objet+date, scroll horizontal, colonne gauche sticky). Navigation "Aujourd'hui" + flèches sur tous les modes.

---

## Build 12 — 2026-06-03

Galerie médias : filtre plage de date période (jour/sem./mois/trim./an) avec flèches prev/next et label dynamique. Lightbox plein écran (nav ←→, Échap, clic fond). MediaCard redesigné : zone image → lightbox, checkbox coin haut-gauche → sélection, bouton 🔗 → notes liées. NoteCard : lightbox sur miniatures sans quitter la vue. Créer note depuis galerie : date = date de la 1ère image sélectionnée. MediaDetail (page notes liées + aperçu grand format). Auto-ancrage après upload sur la date de la première image. Backend : GET /medias/:id/notes.

---

## Build 11 — 2026-06-03

Fix médias : date EXIF extraite en priorité (exifreader, format YYYY:MM:DD → ISO). Réduction automatique à 1600 px max (sharp, withMetadata pour conserver l'EXIF). Proxy Vite /uploads → port 3000 (vignettes visibles en dev). MediaGallery : filtres par défaut "Non liés" + date du jour.

---

## Build 10 — 2026-06-03

Phase 2 Médias : tables jd_medias + jd_note_media, upload multipart (UUID filenames, serveStatic /uploads/*), liste avec filtres (date/type/lié), suppression fichier + DB. MediaGallery (galerie avec drag&drop upload, filtres, sélection multi → créer note). MediaCard (vignette image/PDF, sélection, badge lié, suppression). MediaPicker (inline dans NoteForm, médias du jour, filtres). Vignettes dans NoteCard. NoteForm enrichi (section pièces jointes, médias pré-sélectionnés depuis galerie via location.state). Nav JourDoc : item 📷 Médias.

---

## Build 9 — 2026-06-03

HierarchyPicker unifié avec navigation clavier complète (↑↓ naviguer, Entrée valider, Échap fermer, clic mobile maintenu). État focalisé visible (outline accent). Support nullable/nullLabel pour l'option racine. Sélecteur de parent dans ObjetManager/ThemeManager remplacé par HierarchyPicker (plus de <select>). Footer "X sélectionnés / Effacer" en mode multi.

---

## Build 8 — 2026-06-03

Flèche de dépliage doublée (22→44 px, font 1.5rem) avec hover accent. Sélecteur de parent trié par chemin court (localeCompare sur pathMap) pour refléter la hiérarchie.

---

## Build 7 — 2026-06-03

Améliorations arbres objets/thèmes : sélecteur de parent dans le formulaire d'édition (select avec chemin court, descendants exclus pour éviter les cycles). Noms cliquables dans les arbres → fiche objet (ObjetDetail) ou fiche thème (ThemeDetail, nouveau). Backend : filtre theme_id sur GET /notes.

---

## Build 6 — 2026-06-02

Script de seed idempotent (server/seed-demo.js, npm run seed) : utilisateur test, app jourdoc, workspace Jardin, 12 objets hiérarchiques, 17 thèmes, 6 notes de démo (observations, activités, documentation). Déploiement validé sur apps.pogil.ch (Node 24.15.0).

---

## Build 5 — 2026-06-02

Fix ThemeToggle tronqué : flex-shrink:0 sur topbar__controls et page-auth__controls ; boutons réduits de 26→22 px (toggle total 88→72 px). Ordre inversé dans Login/AdminLogin (ThemeToggle avant LanguageSwitcher). Les 3 icônes ☀️ 🖥 🌙 sont désormais toutes visibles.

---

## Build 4 — 2026-06-02

MVP JourDoc frontend : JourDocApp (shell + sidebar nav responsive), JourDocJournal (vue jour avec navigation date), NoteForm (saisie rapide — type/nature/date/thème/objets/titre auto), NoteCard, ObjetDetail (fiche avec recherche récursive ±3 niveaux, contrôle de direction), ObjetManager et ThemeManager (arbres CRUD inline). Composant HierarchyPicker (sélecteur hiérarchique avec recherche textuelle, modes single/multi). Routes React Router imbriquées. Styles JourDoc dans global.css.

---

## Build 3 — 2026-06-01

Refonte complète du design : système de variables CSS (light/dark/system), ThemeContext, ThemeToggle (segmented control 3 états), LanguageSwitcher, TopBar sticky avec backdrop blur. Redesign de toutes les pages (Login, Portal, AdminLogin, AdminDashboard, AdminSettings, UserEditor, Footer, AppCard, WorkspaceSelector). Responsive mobile/tablet/desktop, support stylet (pointer: fine). Nouvelles clés i18n (greeting, subtitle, backToLogin, edit, confirmDelete).

---

## Build 2 — 2026-06-01

Ajout du composant Footer.jsx affichant le numéro de build et la date en pied de page. Injection des valeurs via Vite `define` (lecture de build.json dans vite.config.js). Footer intégré dans Portal et AdminDashboard.

---

## Build 1 — 2026-06-01

Initialisation du projet : mise en place du CLAUDE.md, création de build.json, CHANGELOG.dev.md et docs/dev/.
