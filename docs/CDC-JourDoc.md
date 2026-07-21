# Cahier des charges — Projet « Jourdoc »

> Document de spécification fonctionnelle et modèle de données
> Auteur : Thierry · Créé le 2 juin 2026 · Mis à jour le 21 juillet 2026 (build 124)
> Statut : en production, itéré au fil des développements

---

## 1. Vision et objectif

**Jourdoc** est un bloc-notes spécialisé permettant d'enregistrer des **événements** et des **informations** rattachés à un ou plusieurs **objets** précis, organisés de façon hiérarchique.

L'usage initial concerne le **jardin** (arbres, plantes, traitements, observations), mais l'application doit rester **agnostique du domaine** : elle doit pouvoir servir pour n'importe quel autre champ d'activité.

L'idée centrale n'est pas seulement de savoir « qu'ai-je fait tel jour ? », mais aussi de pouvoir **ouvrir la fiche d'un objet** (par exemple un arbre) et consulter tout son historique : activités, observations et documentation associées.

### Concepts piliers

| Concept | Rôle |
|---|---|
| **Workspaces** | Cloisonnement complet des contextes (ex. Jardin, Modélisme). |
| **Notes** | Élément central : enregistrement d'événements ou d'informations. |
| **Objets** | Élément pilier : ce sur quoi portent les notes (hiérarchie groupes → individus). |
| **Thèmes** | Classification hiérarchique de la nature/sujet d'une note. |
| **Médias** | Photos, captures d'écran, PDF rattachés aux notes. |
| **Tâches** | Rappels d'actions à faire, synchronisés avec Todoist. |

### Workspaces (cloisonnement des contextes)

L'application intègre un système de **Workspaces** permettant de **séparer complètement les contextes** : un workspace « Jardin », un workspace « Modélisme », etc.

- Chaque workspace possède ses propres objets, thèmes, notes et médias — sans interférence avec les autres.
- Le choix du workspace remplace l'ancien besoin d'un champ « domaine » au niveau des objets (voir §9.1).
- Toutes les vues (calendrier, fiches objets, médias, tâches) s'inscrivent dans le workspace actif.

---

## 2. Les Notes

### 2.1 Deux catégories de notes

| Catégorie | Description | Temporalité |
|---|---|---|
| **Journal** | Notes prises au fil du temps selon les observations et activités. | Datées, liées à un moment précis. |
| **Documentation** | Informations de référence (issues de sites web, PDF liés, copier-coller de texte enrichi). | Intemporelles. |

> Hypothèse de conception : les notes Journal et Documentation cohabitent dans une **même table**, distinguées par un champ « type ».

### 2.2 Nature d'une note (notes de type Journal)

- **Observation** : simple constat, sans action (ex. « ce pommier a une maladie »).
- **Activité** : action réalisée par l'utilisateur (ex. « traitement contre les ravageurs »).
- **Mixte « Observ.→Activité »** (🔀) : note qui relève des deux à la fois. Elle apparaît
  dans les listes filtrées **Observations** *et* **Activités** (pas de filtre « mixte seul »).

> La **documentation** n'a pas de nature mais une **catégorie** ouverte, gérable par
> workspace (nom + emoji + couleur), ainsi que des champs facultatifs *statut*, *auteur*,
> *référence* (voir §10). C'est cette catégorie qui structure la **Bibliothèque**.

### 2.3 Liaison entre notes

Une note doit pouvoir être **liée à d'autres notes**, afin de constituer un fil documenté. Exemple :

1. Observation : « je constate une maladie sur l'arbre » (jour J)
2. Activité : « j'ai fait le traitement » (jour J+x)
3. Observation : « la maladie a disparu » ou « le produit n'a rien fait » (jour J+y)

### 2.4 Liaison aux objets

- Chaque note est liée à **un ou plusieurs objets** (individus et/ou groupes).
- La liaison doit être **souple** : exemple, un traitement appliqué spécifiquement au pommier et au prunier sera lié à ces deux objets seulement — pas à « tous les arbres » ni à « tous les arbres fruitiers », car d'autres arbres fruitiers n'ont pas reçu le traitement.

### 2.5 Texte enrichi et Markdown

Les notes supportent le **texte enrichi** (éditeur Tiptap). En complément :

- **Documents Markdown** (`.md`) joints/liés à une note, éditables in-app via un éditeur
  **markdown-natif** (Milkdown) : titres, listes à cocher, tableaux, encadrés, surlignage,
  formules KaTeX, images collées → assets.
- **Collage de Markdown interprété** : coller du source Markdown le convertit
  automatiquement (rendu riche dans l'éditeur de notes, nœuds dans l'éditeur `.md`). Un
  bouton **« Coller le Markdown »** assure ce comportement de façon fiable sur mobile.

### 2.6 Titre des notes

- Le **titre est obligatoire** pour toute note.
- **Génération automatique** : dans la saisie rapide, un **bouton** génère automatiquement le titre à partir des **noms** des objets et thèmes liés à la note.
  - Format : *objets liés* « → » *thèmes liés*.
  - Exemple : `Pommier Golden, Prunier → Traitement antifongique`.
- **Titre alternatif** (champ dédié) : contient d'office la même composition mais avec les **noms courts**.
  - Exemple : `Pom/Gol, Pru → TrAntif`.
  - Usage : sert dans les **vues calendrier** lorsque la place manque pour afficher le titre complet.

### 2.7 Saisie rapide (priorité mobile)

La saisie d'une note, **en particulier sur mobile**, doit être **très simple et rapide**, en quelques clics.

#### Sélecteur de thème et d'objets

- Le sélecteur présente la **structure hiérarchique** (thèmes / objets).
- Il permet une **recherche textuelle** portant sur **n'importe quelle portion du titre** : taper « gold » doit restreindre la liste à « Pommier Golden ».
- Chaque entrée de la liste s'affiche au format : **nom suivi, entre parenthèses, du chemin composé des noms courts** des ancêtres.
  - Exemple : `Pommier Golden (arb/fru/pom)` pour le chemin *Arbres / Arbres fruitiers / Pommiers*.
- Ce format s'applique aussi bien au choix des **objets** qu'au choix des **thèmes**.

#### Sélecteur de date

- La date par défaut d'une note est **celle du jour**.
- L'utilisateur doit pouvoir choisir une **autre date** via un **mini-calendrier**.
- Prévoir éventuellement des **boutons fléchés** pour reculer / avancer d'**un jour**.

---

## 3. Les Objets

### 3.1 Hiérarchie

Les objets sont organisés en arborescence à profondeur variable :

```
Groupe / Famille
 └─ Sous-groupe
     └─ Sous-sous-groupe
         └─ Individu
```

Exemple jardin :

```
Arbres (groupe)
 └─ Arbres fruitiers (sous-groupe)
     └─ Pommiers (sous-sous-groupe)
         ├─ Pommier n°3 (individu)
         └─ Pommier Golden (individu)
```

> Hypothèse de conception : groupes, sous-groupes et individus sont stockés dans **une même table**, avec une relation parent-enfant et un **indicateur « est un individu »** (tag/booléen).

### 3.2 Fiche d'un objet

L'ouverture d'une fiche objet doit présenter :

- **Bloc activités / observations** : tout ce qui s'est passé sur cet objet (sur la période choisie).
- **Bloc documentation** : toute la documentation liée à cet objet.

### 3.3 Recherche récursive (point clé et différenciant)

C'est la fonctionnalité que les bloc-notes génériques ne savent pas faire. La consultation d'une fiche doit fonctionner dans les **deux sens** :

- **Vers le bas (descendant)** : depuis la fiche d'un groupe (ex. « Pommiers »), voir les notes rattachées aux **individus** contenus dans ce groupe.
  *Cas d'usage : retrouver un traitement appliqué l'an dernier à un individu précis sans se souvenir lequel.*
- **Vers le haut (ascendant)** : depuis la fiche d'un individu (ex. « Pommier Golden »), voir les notes rattachées à sa **parenté** (Pommiers → Arbres fruitiers).
  *Cas d'usage : retrouver un traitement appliqué à tout le groupe des pommiers.*

**Contrainte** : limiter la remontée/descente à environ **3 niveaux** pour éviter des listes trop longues.

---

## 4. Les Thèmes

### 4.1 Rôle

Le thème est un attribut de la note qui en précise le sujet / la nature de l'action : maladie, ravageur, plantation, taille, récolte, etc.

### 4.2 Hiérarchie des thèmes

Comme les objets, les thèmes sont **hiérarchiques** (notion de parent/enfant). Exemples :

| Thème parent | Sous-thèmes |
|---|---|
| **Installation** (« installer une plante ») | Semer, Planter, Repiquer |
| **Récolte** | Cueillette (petits fruits), Récolte-arrachage (ex. salade prise en entier) |

### 4.3 Intérêt de la hiérarchie

- **Préciser** l'activité réalisée (niveau fin).
- **Regrouper** pour analyse : ex. sélectionner le thème parent « Installation » pour voir d'un coup tous les semis + plantations + repiquages d'une saison.

> Distinction sémantique à conserver : *cueillette* (la plante continue de vivre) vs *récolte-arrachage* (la plante finit son cycle).

---

## 5. Les Médias (photos, captures, PDF)

### 5.1 Besoin

Sur le terrain, prendre une **photo** est plus rapide que rédiger une note. L'application doit donc stocker des **photos, captures d'écran et PDF**, puis permettre de les transformer/rattacher en notes.

**Prise/import de photos** : depuis l'édition d'une note (boutons **caméra** et **galerie**),
depuis la médiathèque, ou par **partage natif Android**. Les images sont **converties
(HEIC→JPEG) et redimensionnées côté navigateur** avant l'envoi (compatibilité + contourne
la limite de taille serverless), tout en **préservant la date de prise de vue** (EXIF).

### 5.2 Vue média → note

- Une **vue dédiée** présente l'ensemble des médias.
- L'utilisateur peut **sélectionner plusieurs médias** puis, via un bouton, **créer une note** (observation, activité, journal, etc.) à partir de cette sélection.

### 5.3 Note → médias (sens inverse)

- Depuis une note (existante ou en cours de création), un bouton « **pièces jointes** » présente les images du serveur.
- Filtre par défaut : images **prises le jour même** et **non encore liées** à une note.
- Un bouton permet de **lever ce filtre** et de **modifier la date** (cas d'une activité sur 2 jours : ex. une taille commencée hier et finie aujourd'hui, à laquelle on veut joindre la photo de la veille).

### 5.4 Affichage

- Dans une vue bloc-notes, les médias liés s'affichent directement sous forme de **vignettes**, sans clic supplémentaire.
- Prévoir le cas des **PDF** (affichage potentiellement plus complexe — à anticiper).

---

## 6. Les Tâches (intégration Todoist)

### 6.1 Besoin

Lors d'une observation, pouvoir mémoriser une action à faire (ex. « traitement fongique la semaine prochaine »), éventuellement avec un événement/échéance.

### 6.2 Intégration via API Todoist

Ne pas réinventer un gestionnaire de tâches : c'est **Jourdoc qui crée la tâche dans Todoist** via son API.

### 6.3 Lien bidirectionnel

- À la création, Jourdoc insère dans la **description de la tâche Todoist** une **URL** renvoyant vers la page Jourdoc concernée (l'observation à l'origine de la tâche).
- Réciproquement, la page Jourdoc affiche un **lien direct vers la tâche Todoist**.

### 6.4 Synchronisation

Lien **synchrone** : quand une tâche est réglée/complétée dans Todoist, cela doit se refléter d'une manière ou d'une autre dans Jourdoc.

---

## 7. Consultation, vues et analyses

### 7.1 Portail calendrier

- Se positionner sur un **jour** et voir de façon synthétique tout ce qui s'y est passé (observations + activités).
- Affichage sous forme de **tableau** : objets en colonne, une colonne thèmes, etc. (mise en page à affiner — « être inventif »).
- Choix de la granularité : **jour / semaine / trimestre**, etc.

### 7.2 Affichages génériques

Toutes les listes doivent pouvoir s'afficher :

- en **grille**, ou
- en **calendrier**,
- avec un **clic sur un élément** ouvrant son **détail**.

### 7.3 Analyses comparatives (fonctions avancées — phase ultérieure)

- Comparer des activités **similaires d'une année / saison à l'autre**.
- Exemple : date de floraison du pommier — 1er mai cette année, 5 mai l'an passé, 15 avril l'année d'avant — sous forme de **vue comparative pluriannuelle**.

---

## 8. Fonctionnalités auxiliaires (administration des données)

### 8.1 Import CSV

- Import **CSV** pour peupler la table des **objets** (groupes, sous-groupes, individus).
- Import **CSV** pour peupler la table des **thèmes** (avec leur hiérarchie parent/enfant).

### 8.2 Éditeur de tables pratique

- **Édition en ligne** des listes (objets, thèmes).
- **Insertion** d'un élément.
- **Modification de la structure** : pouvoir **intercaler un niveau intermédiaire** oublié.
  *Exemple : « Pommier Golden » a été créé directement sous « Arbres fruitiers » ; il faut pouvoir insérer facilement un groupe intermédiaire « Pommiers » entre les deux.*

---

## 9. Modèle de données (proposition)

Modèle relationnel déduit des besoins ci-dessus. À affiner lors de la conception détaillée.

### 9.0 Table `workspaces`

| Champ | Type | Description |
|---|---|---|
| `id` | identifiant | Clé primaire |
| `nom` | texte | Libellé du workspace (ex. Jardin, Modélisme) |
| `description` | texte | Optionnel |

> Le workspace cloisonne entièrement les données : objets, thèmes, notes et médias y sont rattachés (directement ou indirectement) et ne se mélangent jamais entre workspaces.

### 9.1 Table `objets`

| Champ | Type | Description |
|---|---|---|
| `id` | identifiant | Clé primaire |
| `nom` | texte | Libellé de l'objet/groupe |
| `parent_id` | référence → `objets.id` | Parent dans la hiérarchie (null si racine) |
| `est_individu` | booléen | True = individu (feuille), False = groupe/famille |
| `nom_court` | texte | Abréviation servant à composer le chemin (ex. Arbres → « arb », Pommiers → « pom »). |
| `description` | texte enrichi | Optionnel |
| `workspace_id` | référence → `workspaces.id` | Workspace de rattachement (remplace l'ancien champ « domaine »). |

### 9.2 Table `themes`

| Champ | Type | Description |
|---|---|---|
| `id` | identifiant | Clé primaire |
| `nom` | texte | Libellé du thème (ex. Semer, Cueillette) |
| `nom_court` | texte | Abréviation servant à composer le chemin (ex. Planter → « pla »). |
| `parent_id` | référence → `themes.id` | Thème parent (hiérarchie) |
| `workspace_id` | référence → `workspaces.id` | Workspace de rattachement. |

### 9.3 Table `notes`

| Champ | Type | Description |
|---|---|---|
| `id` | identifiant | Clé primaire |
| `type` | énumération | `journal` \| `documentation` |
| `nature` | énumération | `observation` \| `activite` \| `mixte` (notes journal ; NULL pour la documentation) |
| `theme_id` | référence → `themes.id` | Thème de la note |
| `doc_categorie_id` | référence → `jd_doc_categorie.id` | Catégorie (documentation), FK `SET NULL` |
| `doc_statut_id` | référence → `jd_doc_statut.id` | Statut (documentation) |
| `doc_auteur`, `doc_reference` | texte | Métadonnées de documentation (facultatives) |
| `titre` | texte | **Obligatoire**. Générable automatiquement à partir des noms des objets/thèmes liés (ex. `Pommier Golden, Prunier → Traitement antifongique`). |
| `titre_alternatif` | texte | Composition avec les **noms courts** (ex. `Pom/Gol, Pru → TrAntif`). Utilisé dans les vues calendrier compactes. |
| `contenu` | texte enrichi | Corps de la note |
| `date` | date/heure | Date de l'événement (notes journal) |
| `source_url` | texte | Pour la documentation (lien web, etc.) |
| `tache_todoist_id` | texte | Référence vers la tâche Todoist liée (optionnel) |

### 9.4 Table de liaison `note_objet` (relation N–N)

| Champ | Type | Description |
|---|---|---|
| `note_id` | référence → `notes.id` | |
| `objet_id` | référence → `objets.id` | Une note ↔ plusieurs objets/groupes |

### 9.5 Table de liaison `note_note` (relations entre notes)

| Champ | Type | Description |
|---|---|---|
| `note_source_id` | référence → `notes.id` | |
| `note_cible_id` | référence → `notes.id` | Ex. observation → activité → observation |
| `type_lien` | texte | Optionnel (nature du lien) |

### 9.6 Table `medias`

| Champ | Type | Description |
|---|---|---|
| `id` | identifiant | Clé primaire |
| `fichier` | fichier/URL | Photo, capture, PDF stocké sur le serveur |
| `type_media` | énumération | `photo` \| `pdf` \| `markdown` |
| `date_prise` | date/heure | Date de prise (sert au filtre « pris ce jour ») |
| `lie` | booléen | Indique si le média est déjà rattaché à une note |
| `externe` | booléen | Média *lié par référence* (fichier hors uploads, jamais copié/déplacé) |

### 9.7 Table de liaison `note_media` (relation N–N)

| Champ | Type | Description |
|---|---|---|
| `note_id` | référence → `notes.id` | |
| `media_id` | référence → `medias.id` | Plusieurs médias par note et inversement |

### 9.8 Schéma relationnel (résumé)

```
workspaces (cloisonnement des contextes)
 └─ objets   (auto-référence parent_id, flag est_individu)
 └─ themes   (auto-référence parent_id)
 └─ notes / médias (via objets & themes du workspace)

objets (auto-référence parent_id, flag est_individu, nom_court)
themes (auto-référence parent_id, nom_court)

notes ──< note_objet >── objets
notes ──< note_media >── medias
notes ──< note_note >── notes   (liaisons entre notes)
notes ──> themes                (theme_id)
notes ──> Todoist               (tache_todoist_id, lien bidirectionnel + synchro)
```

---

## 10. Phasage — état d'avancement (build 124, juillet 2026)

| Phase | Contenu | Statut |
|---|---|---|
| **MVP** | Objets hiérarchiques + notes (journal/doc, nature, thèmes) + liaison notes↔objets + fiche objet avec recherche récursive (±3 niveaux) | ✅ Complet |
| **Phase 2** | Médias (vue média↔note, vignettes, filtres), portail calendrier (jour/semaine/7j/matrice/année), grille/calendrier | ✅ Complet |
| **Phase 3** | Intégration Todoist (création, liaison tâche existante, sync batch, récurrentes, page tâches), import CSV, éditeur inline arbres | ✅ Complet |
| **Phase 4** | Analyses comparatives pluriannuelles (vue semaine × année, filtres hiérarchiques, surlignage colonne), PDF viewer inline | ✅ Complet |

### Fonctionnalités ajoutées depuis la Phase 4 (builds 79 → 124)

**Documentation enrichie**
- **Catégories de documentation** ouvertes par workspace (nom + emoji + couleur) + **statuts**, **auteur**, **référence** ; vue **Bibliothèque** (documentation groupée par catégorie, recherche, tri, densité, filtres objet/thème).
- **Documents Markdown** (`.md`) joints ou **liés par référence** (sans copie) à des fichiers sur KDrive ; éditeur **markdown-natif** (Milkdown : encadrés, surlignage, tableaux, cases à cocher, formules KaTeX, images collées → assets). Import de **bundles Notion** (zip imbriqués) via l'inbox.
- **Collage de Markdown interprété** dans les deux éditeurs (+ bouton dédié, fiable sur mobile).

**Capture web**
- **Web-clipper** : capture d'une page web → note documentation + `.md` joint (images rapatriées sur KDrive). Bookmarklet → fenêtre first-party (insensible à la CSP des sites). Détection « déjà clippé », capture partielle (métadonnées OG) en repli, **annulation** d'une capture non convaincante.
- **Capture in-app d'un lien** (bouton « Capturer » dans la fiche) et **partage natif Android** (« Partager → JourDoc » d'un lien ou de photos/PDF).

**Médias**
- **Conversion HEIC→JPEG + redimensionnement côté navigateur** avant l'envoi (compatibilité mobile + contourne la limite de taille serverless), **date de prise de vue préservée**.
- **Prise/ajout de photos depuis l'édition d'une note** (caméra + galerie, mobile).

**Nature mixte** « Observ.→Activité » (voir §2.2).

**Export**
- Export **complet** d'un workspace (JSON / CSV+médias / **HTML lisible** en ZIP).
- Export d'une **liste filtrée** (vue en l'état) : ZIP agrégé en **Markdown** + **HTML imprimable** (→ PDF), tri par date, options pièces jointes (avec assets des `.md`) et notes liées.

**Robustesse & confort**
- **Redirection automatique vers la connexion** quand la session expire (intercepteur 401 global).
- **Retour de navigation propre** (filtres/vue restaurés) pour Bibliothèque, Calendrier et Analyse.
- Vue annuelle du calendrier, filtres hiérarchiques (objet/thème + direction) partout, popup **et panneau-liste** de fiches au clic dans l'analyse, swipe tactile, PWA installable.

### Idées d'évolution (non encore spécifiées)

- **Modèles de contenu HTML** (+ placeholders) et champ **« données étendues »** (JSON éditable, table dans la fiche).
- Extension de navigateur pour le clipper (desktop).
- Analyses comparatives entre workspaces ; notifications push (PWA) pour les tâches Todoist dues ; recherche globale dans les notes.

---

*Document mis à jour le 21 juillet 2026 — build 124.*
