# JourDoc — Guide utilisateur

> Guide d'utilisation fonctionnel — que fait l'application et comment s'en servir.
> Pour la spécification et les détails techniques, voir `CDC-JourDoc.md` et `docs/dev/`.
> À jour au 21 juillet 2026 (build 124).

---

## Sommaire

1. [À quoi sert JourDoc](#1-à-quoi-sert-jourdoc)
2. [La structure des données](#2-la-structure-des-données)
3. [Les pages de l'application](#3-les-pages-de-lapplication)
4. [Créer et éditer une note](#4-créer-et-éditer-une-note)
5. [Consulter et filtrer](#5-consulter-et-filtrer)
6. [Le principe des médias](#6-le-principe-des-médias)
7. [Importer du contenu](#7-importer-du-contenu)
8. [Exporter](#8-exporter)
9. [Les tâches (Todoist)](#9-les-tâches-todoist)
10. [Astuces & mobile](#10-astuces--mobile)

---

## 1. À quoi sert JourDoc

JourDoc est un **bloc-notes spécialisé** pour consigner des **événements** et des
**informations** rattachés à des **objets** précis, organisés hiérarchiquement.

L'usage d'origine est le **jardin** (arbres, plantes, traitements, observations), mais
l'application reste **agnostique du domaine** : elle convient à n'importe quel champ
d'activité (modélisme, matériel, projets…).

L'idée-clé n'est pas seulement « qu'ai-je fait tel jour ? », mais surtout de pouvoir
**ouvrir la fiche d'un objet** (par ex. un arbre) et consulter **tout son historique** :
activités, observations et documentation associées — y compris ce qui concerne ses
**groupes parents** ou ses **individus enfants**.

---

## 2. La structure des données

### Workspaces (espaces de travail)

Un **workspace** cloisonne complètement un contexte : un workspace « Jardin », un autre
« Modélisme », etc. Chaque workspace a ses propres objets, thèmes, éléments, notes et
médias — **rien ne se mélange** entre workspaces. Vous choisissez le workspace actif au
démarrage (page portail) ; un sélecteur permet d'en changer à tout moment.

### Notes — deux grandes familles

| Famille | Description | Temporalité |
|---|---|---|
| **Journal** | Ce qui se passe au fil du temps (observations, activités). | Daté. |
| **Documentation** | Informations de référence (fiches, pages web capturées, PDF…). | Intemporel. |

- Une note de **journal** a une **nature** : 👁 **Observation**, ⚡ **Activité**, ou
  🔀 **Mixte** (« Observ.→Activité » — à la fois l'un et l'autre).
- Une note de **documentation** a une **catégorie** (libre, avec emoji et couleur), et
  éventuellement un **statut**, un **auteur** et une **référence**.

### Les trois axes de classement d'une note

Une note peut être reliée à trois familles d'étiquettes, chacune avec un rôle distinct :

| Axe | Rôle | Hiérarchique ? |
|---|---|---|
| 🌿 **Objets** | **Ce sur quoi porte** la note (l'arbre, la parcelle, la machine…). | Oui (groupes → individus). |
| 🏷️ **Thèmes** | La **nature/sujet** de l'action (maladie, taille, récolte…). | Oui (thème parent → sous-thèmes). |
| **Éléments** | **Étiquettes libres et plates** pour un marquage transversal (une campagne, un lieu, un fournisseur…). | Non (à plat). |

Une note peut être liée à **plusieurs** objets, **plusieurs** thèmes et **plusieurs**
éléments.

### Objets — la hiérarchie

Les objets sont organisés en arbre à profondeur variable :

```
Arbres (groupe)
 └─ Arbres fruitiers (sous-groupe)
     └─ Pommiers (sous-sous-groupe)
         ├─ Pommier n°3 (individu)
         └─ Pommier Golden (individu)
```

Chaque objet a un **nom** et un **nom court** (abréviation) qui sert à composer des chemins
compacts, ex. `Pommier Golden (arb/fru/pom)`.

### Thèmes — la hiérarchie

Comme les objets, les thèmes sont hiérarchiques. On peut **préciser** (niveau fin :
« Semer », « Repiquer ») ou **regrouper** pour l'analyse (thème parent « Installation »
= semis + plantations + repiquages).

### Éléments — les étiquettes plates

Les **éléments** sont des tags libres, sans hiérarchie, créés à la volée. Ils servent à
marquer et regrouper des notes selon un critère qui n'est ni un objet ni un thème. Ils
sont réutilisables, **fusionnables** (regrouper deux étiquettes équivalentes) et gérés
depuis la page **Objets** (section éléments) ou leur propre gestionnaire.

### Médias

Photos, PDF et **documents Markdown** rattachés aux notes (voir §6).

### Liens entre notes

Une note peut être **liée à d'autres notes** pour constituer un fil documenté. Exemple :
Observation « maladie sur l'arbre » → Activité « traitement effectué » → Observation
« la maladie a disparu ».

### Tâches

Une note peut porter des **tâches** synchronisées avec **Todoist** (voir §9).

---

## 3. Les pages de l'application

La barre de navigation donne accès à :

| Page | Icône | Contenu |
|---|---|---|
| **Journal** | 📔 | Les notes d'un **jour** donné (sélecteur de date + flèches). Point d'entrée quotidien. |
| **Calendrier** | 📅 | Vue temporelle : année / mois / semaine / 7 jours / matrice objets×jours. |
| **Médias** | 📷 | La médiathèque du workspace (import, filtres, sélection → note). |
| **Objets** | 🌿 | Gestion de l'arbre des objets (+ gestion des éléments). |
| **Thèmes** | 🏷️ | Gestion de l'arbre des thèmes. |
| **Biblio** | 📚 | La **Bibliothèque** : toute la documentation, groupée par catégorie. |
| **Tâches** | ✓ | Les tâches Todoist du workspace (À traiter / En cours / Traités). |
| **Analyse** | 📊 | Vue comparative pluriannuelle (semaines × années). |
| **Workspace** | ⚙️ | Réglages du workspace, membres, référentiels, imports/exports. |
| **＋ Nouvelle note** | | Création rapide d'une note. |

Autres écrans : la **fiche d'une note** (lecture / édition), la **fiche d'un objet** ou
d'un **thème** (historique récursif), la page de **connexion**, et le **portail** de
sélection d'application / workspace.

L'application est une **PWA installable** (mobile et bureau) : elle s'ajoute à l'écran
d'accueil et fonctionne comme une app.

---

## 4. Créer et éditer une note

La saisie est pensée pour être **rapide, surtout sur mobile**.

- **Objets, Thèmes, Éléments** : sélecteurs hiérarchiques avec **recherche textuelle** sur
  n'importe quelle portion du nom (« gold » trouve « Pommier Golden »). Chaque entrée
  s'affiche avec son **chemin court** entre parenthèses. Sélection **multiple**, affichée en
  chips. Les éléments se créent **à la volée** (taper un nom inconnu → le créer).
- **Titre automatique** : un bouton compose le titre à partir des objets et thèmes liés,
  au format *objets* « → » *thèmes* (ex. `Pommier Golden, Prunier → Traitement`). Un
  **titre court** (noms courts) est aussi généré pour l'affichage compact du calendrier.
- **Nature** (journal) : Observation / Activité / **Mixte**. **Catégorie** (documentation) :
  choisie dans la liste du workspace.
- **Date** : celle du jour par défaut, modifiable via un mini-calendrier.
- **Contenu enrichi** : éditeur de texte (gras, listes, titres, tableaux, images, mentions
  `@`…). Vous pouvez **coller du Markdown** : il est interprété automatiquement (bouton
  **📋md** pour un collage fiable sur mobile).
- **Pièces jointes** : joindre des médias existants (filtrés par date), **prendre une photo**
  ou en **choisir dans la galerie** (boutons 📷 / 🖼️ sur mobile), **lier un document**
  externe, ou capturer une page web.
- **Fil de notes** : relier la note à d'autres notes.
- **Tâche** : créer ou lier une tâche Todoist.

---

## 5. Consulter et filtrer

C'est le cœur différenciant de JourDoc. Plusieurs vues, avec des **filtres puissants**.

### Les filtres hiérarchiques (objets et thèmes)

Quand vous filtrez par un **objet** ou un **thème**, vous choisissez aussi une **direction** :

- **↕ Les deux** — l'élément seul, plus sa parenté et sa descendance ;
- **↓ Descendants** — depuis un **groupe** (ex. « Pommiers »), voir les notes de ses
  **individus** (retrouver un traitement appliqué à un pommier précis sans se souvenir
  lequel) ;
- **↑ Ancêtres** — depuis un **individu** (ex. « Pommier Golden »), voir les notes de sa
  **parenté** (traitement appliqué à tout le groupe des pommiers).

La **profondeur** de remontée/descente est réglable par workspace (1 à 10 niveaux, 3 par
défaut) pour éviter des listes trop longues.

> Les **éléments** (plats) se filtrent directement (pas de direction). La **catégorie de
> documentation** filtre la Bibliothèque et les fiches.

### Fiche d'un objet / d'un thème

Ouvrir un objet ou un thème affiche **tout son historique** de notes, avec les filtres de
direction ci-dessus, plus des filtres croisés (type journal/documentation, catégorie de
documentation).

### Bibliothèque (documentation) 📚

Toute la documentation, **groupée en étagères par catégorie**. On y trouve :
- **Recherche** plein-texte (titre + contenu) ;
- **Tri** (récent / A→Z) ;
- **Densité** d'affichage (cartes / compact) ;
- **Filtres** objet et thème (avec direction), **catégorie** et **statut**.
- Les filtres et la position de défilement sont **conservés** quand on ouvre une fiche puis
  revient (bouton retour).
- Bouton **📤 Exporter** : exporte la liste filtrée telle qu'affichée (voir §8).

### Calendrier 📅

Cinq modes : **année** (52 semaines/mois), **mois**, **semaine**, **7 jours**, **matrice**
(objets × jours). Chaque note apparaît en **pastille colorée selon sa nature**
(vert = observation, indigo = activité, rose = mixte, orange = documentation). Cliquer un
jour liste les notes de ce jour sous la grille. Filtres objet + thème (avec direction). La
vue (mode, période, filtres) est **conservée** au retour depuis une note.

### Analyse 📊

Une **grille pluriannuelle** : une ligne par année, 52 colonnes (semaines), alignées entre
années — pour comparer d'une saison à l'autre (ex. la date de floraison du pommier au fil
des ans). Sélectionnez d'abord un **objet** ou un **thème** ; filtrez aussi par **nature**.
- **Survol** d'une case : aperçu rapide des notes de la semaine.
- **Clic** sur une case : la même liste s'affiche **en fiches complètes sous la grille**.
- La vue filtrée est **conservée** au retour depuis une note.

---

## 6. Le principe des médias

Sur le terrain, **prendre une photo** va plus vite que rédiger. JourDoc stocke donc des
médias, puis permet de les transformer/rattacher en notes.

### Types de médias

- **Photos** — affichées en vignettes, agrandissables (lightbox).
- **PDF** — consultables (visionneuse intégrée).
- **Documents Markdown (`.md`)** — pièces jointes **éditables dans l'app** (fiches, pages
  web capturées, notes importées) avec un éditeur dédié (titres, listes à cocher, tableaux,
  encadrés, surlignage, formules, images).

### Stockage et traitement

- Les fichiers sont stockés sur **kDrive** (Infomaniak).
- À l'ajout d'une photo, l'app **convertit le HEIC en JPEG** et **redimensionne** l'image
  automatiquement (compatibilité + poids maîtrisé), tout en **conservant la date de prise de
  vue** (utilisée pour dater la note et pour le filtre « pris ce jour »).

### Deux sens d'utilisation

- **Média → note** : depuis la médiathèque, sélectionner un ou plusieurs médias puis
  **créer une note** à partir de la sélection.
- **Note → média** : depuis une note, joindre des médias. Le filtre par défaut propose les
  images **prises le jour même** et **non encore liées** ; on peut lever le filtre et changer
  la date (utile pour une activité sur deux jours).

---

## 7. Importer du contenu

JourDoc offre plusieurs portes d'entrée :

### Photos et fichiers
- **Depuis une note** (mobile) : boutons 📷 **Photo** (caméra) et 🖼️ **Galerie**.
- **Depuis la médiathèque** : **glisser-déposer** ou sélecteur de fichiers (images, PDF,
  `.md`).
- **Inbox kDrive** : déposez des fichiers dans le dossier *inbox* de kDrive, puis lancez le
  **scan** — ils sont importés (avec conversion/redimensionnement). Le scan gère aussi les
  **exports Notion** (archives `.zip` de Markdown + images, décompressées en préservant les
  liens d'images).

### Pages web (web-clipper)
- **Bookmarklet** : un marque-page à cliquer sur n'importe quelle page → JourDoc en extrait
  le texte propre, crée une **note de documentation** + un **`.md` joint** (images rapatriées
  sur kDrive). Détecte si la page a **déjà été clippée**. Une capture peu convaincante peut
  être **annulée**.
- **Depuis une fiche** : bouton **Capturer** à côté du champ « Source URL ».
- **Partage natif Android** : « Partager → JourDoc » d'un **lien** (→ note + capture) ou de
  **photos/PDF** (→ nouvelle note, ajout à une note, ou import en médiathèque).

### Documents Markdown et fichiers externes
- **Créer** un document `.md` vierge et le joindre à une note, éditable dans l'app.
- **Lier un fichier externe** : rattacher **par référence** (sans copie) un fichier déjà
  présent sur kDrive (`.md`, PDF, image…). L'original n'est jamais renommé ni déplacé ;
  « supprimer » ne fait que retirer la référence.

### Référentiels (CSV)
- **Import CSV** des **objets** et des **thèmes** (avec leur hiérarchie), depuis la page
  Objets / Thèmes.

---

## 8. Exporter

### Export complet du workspace
Depuis **Workspace ⚙️** :
- **JSON** — toutes les données structurées.
- **CSV (ZIP)** — un fichier par table + les liaisons ; option **avec les médias**.
- **HTML lisible (ZIP)** — un sommaire + une page par note (images incluses), lisible
  hors-ligne.

### Export d'une liste filtrée (vue en l'état)
Depuis la **Bibliothèque** ou l'**Analyse**, bouton **📤 Exporter** : produit un **ZIP**
contenant la liste **agrégée** dans les notes affichées, en deux formats :
- **`liste.md`** (Markdown) et **`liste.html`** (mis en page, **imprimable → PDF** via le
  navigateur).
- Options : **tri** par date (↑/↓ ; date de référence pour le journal, date de création pour
  la documentation), **avec/sans pièces jointes** (dossier `medias/`, y compris les images
  internes des `.md`), **avec/sans notes liées**.

---

## 9. Les tâches (Todoist)

Lors d'une observation, on peut mémoriser une **action à faire**. JourDoc **crée la tâche
dans Todoist** (pas de gestionnaire réinventé) :

- Lien **bidirectionnel** : la tâche Todoist contient un lien retour vers la note ; la note
  affiche un lien direct vers la tâche.
- **Plusieurs tâches par note** (jusqu'à 10), avec priorité, échéance, récurrence.
- **Synchronisation** : une tâche terminée dans Todoist se reflète dans JourDoc.
- La page **Tâches ✓** centralise tout, trié par **urgence**, en sections *À traiter / En
  cours / Traités*.

*(La connexion Todoist se configure dans **Workspace ⚙️** : jeton + projet.)*

---

## 10. Astuces & mobile

- **Installer l'app** (PWA) : « Ajouter à l'écran d'accueil » — JourDoc se comporte comme
  une application.
- **Swipe** : balayer horizontalement pour naviguer (journal, calendrier, entre notes).
- **Coller du Markdown** : bouton **📋md** dans les éditeurs (fiable même sur mobile).
- **Session expirée** : si votre connexion a expiré, l'app vous **redirige vers la page de
  connexion** puis vous **ramène** là où vous étiez.
- **Retour de navigation** : dans la Bibliothèque, le Calendrier et l'Analyse, vos **filtres
  sont conservés** quand vous ouvrez une note puis revenez.
- **Sélecteurs** : le comportement des sélecteurs hiérarchiques (réduire la liste, ou y
  défiler) est réglable **par workspace et par plateforme** dans les réglages.

---

*Pour toute question technique (modèle de données détaillé, API, déploiement), voir
`CDC-JourDoc.md` et le dossier `docs/dev/`.*
