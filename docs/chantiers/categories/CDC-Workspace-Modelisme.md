# CDC — Workspace « Modélisme ferroviaire » pour JourDoc

> Structure de données du workspace : arbres Objets et Thèmes, catégories, éléments,
> schémas de données étendues.
> Établi le 2 août 2026 · Source : mindmap « JourDoc - Workspace Trains »
> **Révision du 7 octobre 2026 — état CIBLE, après la migration « Catégories unifiées ».**
> Références : `CDC-JourDoc.md` (V2.1, build 135), `MIGRATION-categories.md`

> ⚠️ **Ce document décrit l'état d'arrivée, pas l'état actuel du workspace.**
> Le workspace en production porte encore une racine de thèmes `Interventions` ; elle est
> supprimée par la migration et remplacée par des catégories. Voir `README-handoff.md` pour
> savoir quel document décrit quel état.

---

## 1. Principe directeur

Le mindmap d'origine mélange plusieurs natures d'information dans une même arborescence. La
transposition dans JourDoc les répartit sur les axes prévus par le modèle :

| Nature | Exemple | Axe JourDoc | Hiérarchique | Cardinalité |
|---|---|---|---|---|
| **Instances** — ce qui existe et se suit dans le temps | Loco 1, Aiguillage 21a, Secteur Est | **Objets** | oui | N (+ principal) |
| **Interventions** — ce qu'on a fait | Contrôle technique, Construction | **Catégories** (portée journal) | oui, non exploité | N |
| **Apports documentaires** — ce que le document apporte | Norme, Tutoriel, Produit | **Catégories** (portée doc) | oui, non exploité | N |
| **Nomenclature** — de quelle partie il s'agit | Décodeur, Charpente, Aiguillage | **Thèmes** (racine *Composants*) | oui | N |
| **Savoir-faire** — comment, avec quoi | Patine, Carton plume, Fer à souder | **Thèmes** (racine *Pratiques*) | oui | N |
| **Écartement** — pour la doc générique | 0m, 0e | **Thèmes** (racine *Écartement*) | oui | N |
| **Regroupements éphémères** | Réfection Section M1 | **Éléments** | non | N |

### Règle d'or

> **Les thèmes disent de quoi ça parle. Les catégories disent ce que c'est.**
> **L'objet principal est TOUJOURS une instance** (réseau/partie, ou véhicule/rame).

Aucune hiérarchie de saisie n'est à respecter : l'ordre de sélection des thèmes est
indifférent, et les catégories sont résolues en bloc par fusion (§6.1). La notion de « thème
principal » n'existe plus dans ce workspace.

---

## 2. Arbre des Objets

Deux racines, **uniquement des instances**. Voir `objets.csv` pour l'import — inchangé par la
migration.

### 2.1 Réseaux

```
Réseaux (res)
├─ CFG2 (cfg2)                                   ── écartement 0m, réseau de jardin
│  ├─ Établissements CFG2 (etab)
│  │  ├─ Gare "Amont" (amont)
│  │  │  └─ Aiguillage 12a / 12b / 21a / 21b / 23 / 32
│  │  ├─ Gare "Aval" (aval)      └─ …
│  │  ├─ Remise CFG2 (remi)
│  │  ├─ Station "La Creuse" (creu)
│  │  └─ Station "La Bosse" (boss)
│  ├─ Lignes CFG2 (lig)
│  │  ├─ Montagne (mont) ── Section M1, Section M2
│  │  └─ Plaine (pla) ──── Section P1, Section P2, Liaison directe M1–Gare Aval
│  └─ Ouvrages d'art CFG2 (oa)
│     └─ Viaduc de la Sécheronne I, Pont sur la Sécheronne II,
│        Pont de la Creuse, Pont de la Ravine
└─ CFD (cfd)                                     ── deux compagnies, 0m et 0e
   ├─ Territoire (terr)                          ── le terrain modelé, support des deux
   │  ├─ Secteur Est (est) ──── Est Niveau -1, Est Niveau +1
   │  └─ Secteur Ouest (ouest) ─ Ouest Niveau -1, Ouest Niveau 0, Ouest Niveau +1
   ├─ Compagnie 0m (c0m)
   │  ├─ Établissements CFD-0m (etab) ── Gare commune 0m, Remise 0m, …
   │  ├─ Lignes CFD-0m (lig)
   │  └─ Ouvrages d'art CFD-0m (oa)
   └─ Compagnie 0e (c0e)
      ├─ Établissements CFD-0e (etab) ── Gare commune 0e, Remise 0e, …
      ├─ Lignes CFD-0e (lig)
      └─ Ouvrages d'art CFD-0e (oa)
```

**Contrainte de nommage.** L'import CSV résout le parent par **nom** et non par chemin : les
noms doivent donc être **uniques dans toute la table**. Les libellés structurels répétés d'une
branche à l'autre sont suffixés (`Établissements CFG2` / `Établissements CFD-0m` /
`Établissements CFD-0e`, idem pour les lignes et les ouvrages d'art), et les niveaux du
territoire sont préfixés par leur secteur (`Est Niveau -1`, `Ouest Niveau -1`). Le `nom_court`
reste identique entre branches (`etab`, `lig`, `oa`) : c'est lui qui compose le chemin
affiché, la répétition y est sans conséquence et même souhaitable pour la lisibilité.
Même contrainte côté matériel roulant : `Moteur 0m` / `Remorqué 0m` / `Rames 0m` plutôt que
trois `0m`.

**Deux couches, pas deux découpages concurrents.** `Territoire` est l'espace physique modelé
(une région inventée, construite secteur par secteur, niveau par niveau) ; les `Compagnies`
sont les chemins de fer bâtis dessus. Ce ne sont pas deux vues du même objet mais deux
strates superposées, d'où deux branches parallèles légitimes. Une note de terrassement ou de
charpente vise un secteur/niveau ; une note d'exploitation ou de pose de voie vise un
établissement ou une ligne de compagnie.

**Double écartement de CFD.** Les deux compagnies sont techniquement et commercialement
distinctes : voies, normes, alimentation, système de commande, bâtiments, véhicules et trafic
propres. La « gare commune » n'est pas un objet partagé mais **deux gares juxtaposées**
(modèle Palézieux CFF / TPF) : elle se dédouble en `Gare commune 0m` et `Gare commune 0e`.

**Accès rapide au 0m / 0e.** Ouvrir la fiche `Compagnie 0e` donne tout son historique
récursif en un clic, sans filtre. Pour la documentation générique non rattachée à une
instance (normes, produits, techniques propres à un écartement), voir la racine de thèmes
`Écartement` (§3.3).

### 2.2 Matériel roulant

```
Matériel roulant (mr)
├─ Mat. moteur (mot)
│  ├─ Moteur 0m (0m) ── Loco 1, Loco 2
│  └─ Moteur 0e (0e) ── …
├─ Mat. remorqué (rq)                            ── véhicules SPÉCIAUX/uniques seulement
│  ├─ Remorqué 0m (0m) ── Voiture A, Voiture B
│  └─ Remorqué 0e (0e) ── …
└─ Rames (rame)
   ├─ Rames 0m (0m) ── Rame BE, Rame marchandise
   └─ Rames 0e (0e) ── …
```

**Type d'abord, écartement ensuite.** Dans l'ordre inverse (`0m → Mat. moteur`), chaque
schéma devrait être dupliqué pour 0m et 0e. Ici, un schéma posé sur `Matériel roulant` ou
`Mat. moteur` **descend automatiquement sur les deux écartements** par héritage. Le niveau
écartement ne sert qu'à la navigation et au filtre ↓ (« tout mon parc 0e »).

**Les rames sont des individus, pas des groupes.** Ce qui se consigne (« déraille en pousse
entre la voiture 2 et 3 ») porte sur la rame en tant qu'ensemble. Les voitures identiques
n'existent donc pas comme objets. Un véhicule unique se crée sous `Mat. remorqué` s'il
circule librement, ou **sous la rame** si son affectation est stable — il remonte alors dans
la fiche de la rame par filtre ↓.

---

## 3. Arbre des Thèmes

**Trois racines, aucune résolvante.** Les thèmes répondent à une seule question — *de quoi
ça parle* — identique pour le journal et la documentation. Voir `themes-cible.csv` pour
l'import (97 thèmes, profondeur 4).

### 3.1 Racine `Composants` (comp) — nomenclature

```
Composants (comp)
├─ Composants mat. roulant (cmr)
│  ├─ Châssis et caisse (chas)
│  ├─ Organes de roulement (orou) ── Motorisation, Engrenage, Essieux et bogies
│  ├─ Installation électrique (ielec) ── Décodeur, Éclairage véhicule
│  └─ Livrée et décoration (livr)
├─ Infrastructure (infr)                    ── commun aux deux types de réseau
│  ├─ Voie (voie) ── Aiguillage, Croisement, Butoirs
│  ├─ Agencement général (agen) ── Plan de voies
│  ├─ Ouvrages (ouvr) ── Pont, Tunnel
│  ├─ Bâtiments (bati) ── Gare, Remise, Maison de garde, Halle marchandises,
│  │                      Quai haut, Industrie, Civil
│  └─ Appareils spéciaux (apsp) ── Pont-secteur, Plaque tournante, Pont transbordeur
├─ Réseau d'intérieur (rint)
│  ├─ Charpente (char)
│  ├─ Support de voie (supv)
│  ├─ Fond de décor (fdec)
│  ├─ Éclairage de scène (eclr)
│  ├─ Coulisses (coul)
│  └─ Décor intérieur (dint) ── Reliefs, Végétation synthétique, Plans d'eau factices
├─ Réseau d'extérieur (rext)
│  ├─ Fondation (fond)
│  ├─ Pose de voie extérieure (posx)
│  ├─ Drainage et écoulement (drai)
│  ├─ Soutènement et bordures (sout)
│  ├─ Hivernage et protection (hiv)
│  └─ Décor extérieur (dext) ── Terrassement, Végétation naturelle, Cours d'eau
└─ Commande et traction (ctra)
   ├─ Câblage (cabl)
   ├─ Système DCC (dcc) ── Centrale, Télécommande et récepteur, Balises
   ├─ Commande analogique (anal)
   └─ Tableau de commande (tabc)
```

**Scission intérieur / extérieur, ciblée.** Les deux réseaux relèvent de mondes différents :
**CFG2 est un réseau de jardin** (le plus développé à ce jour), **CFD un réseau d'intérieur**
(encore à l'état de projet). La distinction est réelle et documentaire : la végétation
extérieure est vivante, l'intérieure est synthétique ou fabriquée ; les cours d'eau sont
réels ou factices ; la voie est la même mais sa fixation diffère. Techniques, matériaux et
sources ne se recouvrent pas — ce sont bien deux sujets distincts, et non un même sujet vu
de deux endroits.

En revanche la scission ne vaut **que pour ce qui est exposé au décor et aux intempéries**.
Aiguillage, plan de voies, plaque tournante, pont, typologie de bâtiments sont identiques des
deux côtés : ils restent regroupés sous `Infrastructure`. Cela évite de dupliquer une
vingtaine de thèmes sans bénéfice.

*`Drainage et écoulement`, `Soutènement et bordures` et `Hivernage et protection` sont des
ajouts au mindmap, propres au réseau de jardin. À valider ou compléter.*

**Les types de bâtiments sont maintenus** — et ils ne font pas doublon avec l'arbre des
Objets. C'est ici que se joue la raison d'être de toute la racine `Composants` : **elle
qualifie ce qui n'a pas d'instance**. La documentation se répartit en deux populations :

- celle qui **porte sur un individu identifié** (plan, descriptif de réalisation de sa main) :
  elle se rattache à l'objet ; le thème `Bâtiments` suffit alors ;
- celle qui **porte sur un type** (article d'inspiration sur les maisons de garde, tutoriel
  de construction d'un bâtiment voyageur) : elle n'a **aucun référent** dans l'arbre des
  Objets. La rattacher à un bâtiment qui n'existe qu'à l'état de projet serait doublement
  faux — cela créerait une instance fantôme, et l'information serait perdue le jour où le
  bâtiment n'est pas construit, ou construit ailleurs, ou son principe repris pour un
  bâtiment d'un autre type.

Sur CFD, tout le bâti est aujourd'hui imaginaire : la documentation thématique est donc la
seule qui existe. Le sous-niveau de types est indispensable.

La typologie est commune intérieur/extérieur : un type de bâtiment est un type de bâtiment.
Ce sont les **techniques et matériaux** qui divergent (carton plume à l'abri, résine ou
béton au jardin), et ils sont portés par la racine `Pratiques`.

`Éclairage véhicule` et `Éclairage de scène` sont explicitement distingués : l'import
résolvant les parents par nom, deux thèmes homonymes seraient ambigus. Même raison pour
`Composants mat. roulant`, qui ne peut pas s'appeler simplement « Matériel roulant ».

### 3.2 Racine `Pratiques` (prat) — savoir-faire

```
Pratiques (prat)
├─ Techniques (tech) ── Collage, Peinture ── Patine, Soudage, Moulage,
│                       Impression 3D, Découpage laser
├─ Matériaux (matx) ── Carte plastique, Carton plume, Bois, Carton,
│                      Laiton, Cuivre, Feuille d'aluminium
└─ Outillage (outi)
   ├─ Gros outillage électrique (gros) ── Perceuse sur colonne, Scie à onglet
   ├─ Petit outillage électrique (peti) ── Perceuse-visseuse sans fil, Mini-perceuse,
   │                                       Fer à souder, Appareils de mesure
   ├─ Outils à main (main) ── Limes, Cutters
   └─ Aides (aide) ── Robot 3ème main, Support véhicule, Gabarit
```

**L'outillage est ici, pas dans les Objets** : on ne tient pas de journal *sur* ses outils,
ils sont le **sujet** de documentation (notice, tutoriel, présentation produit) ou une
mention incidente dans une session. `Patine` est placée sous `Peinture` : un filtre ↓ sur
Peinture ramène l'ensemble.

### 3.3 Racine `Écartement` (ecar) — qualificatif transversal

```
Écartement (ecar)
├─ 0m (e0m)
└─ 0e (e0e)
```

**Pourquoi une racine de thèmes et non un élément.** Les notes rattachées à une instance
n'en ont pas besoin : l'objet porte déjà l'information (CFG2 est en 0m, `CFD/Compagnie 0e`
est explicite), et ouvrir la fiche de la compagnie donne l'historique complet en un clic.
Le besoin ne concerne que la **documentation générique sans objet** — une norme, un produit,
une technique propres à un écartement.

Les éléments seraient l'axe naturel, mais ils ne sont pas encore filtrables (§4). Une racine
de thèmes l'est **immédiatement**, partout, sans développement. Trois nœuds. Migration vers
les éléments possible plus tard si le filtre plat est implémenté.

---

## 4. Éléments (étiquettes plates)

Une seule famille :

| Élément | Rôle |
|---|---|
| `Réfection Section M1`, `Reconstruction Station A`, `Révision Loco 1`… | **Projets** — regroupement éphémère et transversal, pour retrouver d'un coup toutes les notes d'un chantier (plan → réflexion → décision → réalisation). |

> ⚠️ **Dépendance.** Cet usage suppose que le **filtre par élément** soit implémenté. Le CDC
> JourDoc §4 bis le prévoit (« retrouver toutes les notes portant cette étiquette ») mais
> l'application se limite aujourd'hui à l'affichage en chips. C'est un développement léger :
> pas de direction hiérarchique ni de récursion, un simple multi-select plat à brancher sur
> les filtres existants (Bibliothèque, Calendrier, fiche objet). C'est le **seul** usage des
> éléments dans ce workspace. **Repli si non développé** : une *note-pivot de projet* (note
> de catégorie `Plan`) reliée par le fil de notes à toutes les notes du chantier —
> fonctionnel, mais chaque note demande un lien manuel.

---

## 5. Catégories

**19 catégories, multi-valuées, chacune déclarant sa portée.** Voir `categories.csv` pour
l'import. Le libellé affiché est contextuel : **« Apports »** côté documentation,
**« Interventions »** côté journal.

### 5.1 Portée documentation — ce que le document apporte

Ce qui est catégorisé n'est pas la **forme** du document (revue, livre, fiche — indifférente)
mais son **apport**. Une même notice peut être à la fois un manuel, un descriptif et un
recueil de conseils ; le même contenu se présente tantôt en un document, tantôt en deux.
D'où la multi-valuation.

| Catégorie | Emoji | Définition | Exemple |
|---|---|---|---|
| **Norme** | 📐 | Référentiel officiel ou de fait | NEM 114 entraxe voie 0m |
| **Tutoriel** | 🔧 | Comment faire | Bâtiment voyageur en carton plume |
| **Exemple** | 💡 | Source d'inspiration, réalisation d'autrui | Réseau « Les mouettes » |
| **Schéma et esquisse** | ✏️ | Croquis, plan d'intention | Esquisse péninsule CFD |
| **Plan** | 📋 | Plan abouti et coté | Plan de voie station La Creuse |
| **Descriptif** | 📄 | Caractéristiques d'un bien possédé | Fiche Loco 1 |
| **Produit** | 🛒 | Bien achetable, non (encore) possédé | Bogies Mashimamoto XL |

La frontière **Descriptif / Produit** est la possession : *Produit* décrit ce qu'on pourrait
acheter, *Descriptif* ce qu'on a. Un produit acheté peut donner naissance à un Descriptif —
et une fiche de nouveauté peut légitimement porter les deux.

### 5.2 Portée journal — ce qu'on a fait ou constaté

| Catégorie | Emoji | obs. | act. | nature_defaut |
|---|---|:--:|:--:|---|
| **Dégât** | ⚠️ | ✓ | | — |
| **Idée** | 💭 | ✓ | | — |
| **Visite** | 🚶 | ✓ | | — |
| **Réflexion** | 🤔 | | ✓ | — |
| **Construction** | 🏗️ | | ✓ | — |
| **Entretien** | 🧰 | | ✓ | — |
| **Roulement** | 🚂 | ✓ | ✓ | `mixte` |
| **Essai** | 🧪 | ✓ | ✓ | `activite` |
| **Contrôle technique** | ✅ | ✓ | ✓ | `activite` |
| **Réparation** | 🔩 | | ✓ | — |
| **Rénovation** | ♻️ | | ✓ | — |
| **Achat** | 🛍️ | | ✓ | — |

La **portée** filtre la liste proposée à la saisie selon le contexte (documentation, ou
journal selon la nature). Elle remplace le regroupement Observation/Activité du mindmap, déjà
porté par le champ **nature** de la note.

`nature_defaut` ne sert que dans le cas ambigu — une catégorie ouverte aux deux. Quand la
portée journal est univoque, la nature se dérive.

**Pas de scission Réseau / Véhicule.** Le mindmap distinguait *Session construction* (réseau)
de *Construction* (véhicule) : c'est l'**objet** qui porte déjà cette distinction. Une seule
catégorie `Construction` suffit ; si les données étendues doivent différer, on crée deux
schémas `Construction × Réseaux` et `Construction × Matériel roulant`.

### 5.3 Deux conséquences

**Les sources** (Locorevue, Voie Libre, chaîne YouTube, site) passent par le champ natif
**référence** de la documentation — pas par les éléments, qui exploseraient en nombre. Format
recommandé et constant : `Voie Libre n°28, p. 34` ; l'URL va dans `source_url`.

**L'inventaire de parc.** Un objet JourDoc ne porte pas de champs propres. La fiche technique
d'une loco est donc une **note de documentation `Descriptif`** liée à cet objet, portant les
données étendues du schéma 6. La Bibliothèque filtrée sur *Descriptif*, triée/groupée sur ces
données et exportée en CSV constitue l'inventaire complet du parc — sans développement
supplémentaire.

---

## 6. Schémas de données étendues

Axes : `objet_id` · `theme_id` · `categorie_id` · `nature` (chacun facultatif = joker).
Toutes les combinaisons ci-dessous sont distinctes au sens de la contrainte
`UNIQUE NULLS NOT DISTINCT (workspace_id, objet_id, theme_id, categorie_id, nature)`.

| # | Nom | objet | catégorie | thème | nature |
|---|---|---|---|---|---|
| 1 | Contrôle technique véhicule | Matériel roulant | Contrôle technique | — | — |
| 2 | Essai véhicule | Matériel roulant | Essai | — | — |
| 3 | Session de roulement | Réseaux | Roulement | — | — |
| 4 | Visite | — | Visite | — | — |
| 5 | Achat | — | Achat | — | — |
| 6 | Fiche technique véhicule | Matériel roulant | Descriptif | — | — |
| 7 | Fiche produit | — | Produit | — | — |

**Aucun schéma n'est piloté par un thème.** C'est le constat empirique qui a motivé la
migration : après plusieurs semaines d'usage, l'axe résolvant s'est révélé être la catégorie,
jamais le thème. `theme_id` reste disponible comme axe de contexte — un schéma piloté par un
composant (des mesures propres à un type d'ouvrage, par exemple) reste concevable.

### 6.1 Fusion

Une note portant plusieurs catégories applique **l'union des champs** des schémas de chacune,
dédupliqués par leur clé `cle`, dans l'ordre des catégories. Spécification complète et
algorithme : `MIGRATION-categories.md` §5.

Conséquence pratique pour ce workspace : une note `Contrôle technique + Essai` sur Loco 1
fusionne les schémas 1 et 2 en 11 champs — `remarques`, présent dans les deux avec le même
type, n'apparaît qu'une fois. Sans fusion, il aurait fallu créer un schéma
`Contrôle technique et essai` distinct, puis un autre pour chaque combinaison rencontrée.

### Schéma 1 — Contrôle technique véhicule

Un seul schéma pour locos, véhicules remorqués **et rames** : la valeur `n/a` absorbe les
organes absents (une rame n'a ni moteur ni pantographe). Liste ordonnée du moins au plus
informatif.

```json
{
  "nom": "Contrôle technique véhicule",
  "objet": "Matériel roulant", "categorie": "Contrôle technique",
  "champs": [
    { "cle": "bandages",    "label": "Bandages",           "type": "liste", "options": ["n/c","n/a","KO","partiel","OK"] },
    { "cle": "prises",      "label": "Prises de courant",  "type": "liste", "options": ["n/c","n/a","KO","partiel","OK"] },
    { "cle": "moteurs",     "label": "Moteurs",            "type": "liste", "options": ["n/c","n/a","KO","partiel","OK"] },
    { "cle": "magnets",     "label": "Magnets",            "type": "liste", "options": ["n/c","n/a","KO","partiel","OK"] },
    { "cle": "attelages",   "label": "Attelages",          "type": "liste", "options": ["n/c","n/a","KO","partiel","OK"] },
    { "cle": "eclairage",   "label": "Éclairage",          "type": "liste", "options": ["n/c","n/a","KO","partiel","OK"] },
    { "cle": "pantographes","label": "Pantographes",       "type": "liste", "options": ["n/c","n/a","KO","partiel","OK"] },
    { "cle": "remarques",   "label": "Remarques",          "type": "texte" }
  ]
}
```

*Légende : `n/c` = non contrôlé · `n/a` = non applicable · `KO` = défectueux ·
`partiel` = fonctionne partiellement · `OK` = conforme.*

### Schéma 2 — Essai véhicule

```json
{ "objet": "Matériel roulant", "categorie": "Essai",
  "champs": [
  { "cle": "resultat", "label": "Résultat global", "type": "echelle", "min": 1, "max": 5 },
  { "cle": "vitesse_min", "label": "Vitesse mini stable", "type": "texte" },
  { "cle": "remarques", "label": "Remarques", "type": "texte" }
] }
```

> `remarques` est partagé avec le schéma 1 — **même clé, même type, même label**. C'est la
> condition de validité de la fusion (§5.3 de `MIGRATION-categories.md`).

### Schéma 3 — Session de roulement

```json
{ "objet": "Réseaux", "categorie": "Roulement",
  "champs": [
  { "cle": "fonctionnement", "label": "Fonctionnement global", "type": "echelle", "min": 1, "max": 5 },
  { "cle": "duree", "label": "Durée (h)", "type": "decimal" },
  { "cle": "materiel", "label": "Matériel engagé", "type": "texte" },
  { "cle": "incidents", "label": "Incidents", "type": "nombre" }
] }
```

### Schéma 4 — Visite

```json
{ "categorie": "Visite",
  "champs": [
  { "cle": "organisateur", "label": "Organisateur", "type": "texte" },
  { "cle": "lieu", "label": "Lieu", "type": "texte" },
  { "cle": "echelles", "label": "Échelles présentes", "type": "texte" },
  { "cle": "interet", "label": "Intérêt", "type": "echelle", "min": 1, "max": 5 }
] }
```

### Schéma 5 — Achat

```json
{ "categorie": "Achat",
  "champs": [
  { "cle": "fournisseur", "label": "Fournisseur", "type": "texte" },
  { "cle": "quantite", "label": "Quantité", "type": "nombre" },
  { "cle": "prix_unitaire", "label": "Prix unitaire", "type": "decimal", "unite": "CHF" },
  { "cle": "prix_total", "label": "Prix total", "type": "decimal", "unite": "CHF" },
  { "cle": "date_commande", "label": "Date de commande", "type": "date" }
] }
```

### Schéma 6 — Fiche technique véhicule (catégorie *Descriptif*)

```json
{ "objet": "Matériel roulant", "categorie": "Descriptif",
  "champs": [
  { "cle": "fabricant", "label": "Fabricant", "type": "texte" },
  { "cle": "reference", "label": "Référence", "type": "texte" },
  { "cle": "ecartement", "label": "Écartement", "type": "liste", "options": ["0m","0e"] },
  { "cle": "epoque", "label": "Époque", "type": "liste", "options": ["I","II","III","IV","V","VI"] },
  { "cle": "longueur", "label": "Longueur", "type": "decimal", "unite": "mm" },
  { "cle": "poids", "label": "Poids", "type": "decimal", "unite": "g" },
  { "cle": "digitalise", "label": "Digitalisé", "type": "ouinon" },
  { "cle": "decodeur", "label": "Décodeur", "type": "texte" },
  { "cle": "adresse_dcc", "label": "Adresse DCC", "type": "nombre" },
  { "cle": "date_achat", "label": "Date d'achat", "type": "date" },
  { "cle": "prix", "label": "Prix d'achat", "type": "decimal", "unite": "CHF" }
] }
```

### Schéma 7 — Fiche produit (catégorie *Produit*)

```json
{ "categorie": "Produit",
  "champs": [
  { "cle": "fournisseur", "label": "Fournisseur", "type": "texte" },
  { "cle": "reference", "label": "Référence", "type": "texte" },
  { "cle": "prix", "label": "Prix", "type": "decimal", "unite": "CHF" },
  { "cle": "ecartement", "label": "Écartement", "type": "liste", "options": ["n/a","0m","0e"] },
  { "cle": "disponibilite", "label": "Disponibilité", "type": "liste", "options": ["à vérifier","disponible","épuisé","annoncé"] }
] }
```

> ⚠️ **Conflits de clés à surveiller.** `reference` et `fournisseur` apparaissent dans
> plusieurs schémas avec le même type `texte` — cohérent. `prix` est `decimal CHF` dans les
> schémas 6 et 7 — cohérent également. Toute évolution doit préserver cette cohérence : voir
> la requête de détection dans `MIGRATION-categories.md` §5.3.

---

## 7. Validation sur les cas d'usage du mindmap

| Cas d'usage | Objet principal | Catégories | Thèmes | Nature | Schémas |
|---|---|---|---|---|---|
| Aiguillage 21a défectueux | Aiguillage 21a | Dégât | Voie/Aiguillage | observation | — |
| Session roulement 21 juillet | CFG2 | Roulement | — | mixte | 3 |
| Contrôle technique Loco 1 | Loco 1 | **Contrôle technique, Réparation, Entretien** | Livrée et décoration ; Installation électrique | activité | 1 |
| Essai + contrôle après révision | Loco 1 | **Contrôle technique, Essai** | Organes de roulement | activité | **1 + 2 fusionnés** |
| Session entretien 22 juillet | Aiguillage 21a | Entretien | Voie/Aiguillage | activité | — |
| Travaux de réfection | Pont sur la Sécheronne II | Construction | Pose de voie extérieure | activité | — |
| Session construction CFD 1ᵉʳ mars | Est Niveau -1 | Construction | Charpente ; Scie à onglet | activité | — |
| Achat 2 moteurs de rechange | Loco 1 | Achat | Organes de roulement/Motorisation | activité | 5 |
| Réflexion plan de voie La Creuse | Station "La Creuse" | **Réflexion** | Plan de voies | activité | — |
| Idée d'agencement CFD | CFD | Idée | Agencement général | observation | — |
| Retours de visite club XY | — | Visite | Agencement général | observation | 4 |
| Norme NEM 114 | — | Norme | Plan de voies ; Écartement/0m | doc | — |
| Tutoriel bâtiment carton plume | — | Tutoriel | Bâtiments/Gare ; Carton plume ; Patine ; Collage | doc | — |
| Plan de la halle de la gare Aval | Gare "Aval" | Plan | Bâtiments/Halle marchandises | doc | — |
| Article sur les maisons de garde | — | Exemple | Bâtiments/Maison de garde | doc | — |
| Réseau « Les mouettes » | — | Exemple | Coulisses ; Appareils spéciaux/Pont-secteur | doc | — |
| Bogies Mashimamoto XL | — | **Produit, Descriptif** | Organes de roulement/Essieux et bogies ; Écartement/0m | doc | 7 seul ¹ |
| Notice de la scie à onglet | — | **Descriptif, Tutoriel** | Outillage/Scie à onglet | doc | — ² |
| Essai imprimante 3D Bamboo | — | Produit, Exemple | Impression 3D | doc | 7 |
| Pose de voie en jardin | — | Tutoriel | Pose de voie extérieure ; Fondation | doc | — |

¹ Le schéma 6 ne se résout pas : son axe objet est `Matériel roulant`, or cette note de revue
n'a pas d'objet. Seul le schéma 7 s'applique. La fusion n'ajoute un schéma que s'il résout
sur **tous** ses axes.

² Ni `Descriptif` ni `Tutoriel` n'a de schéma applicable hors matériel roulant. Aucune donnée
étendue — c'est le cas normal pour la majorité de la documentation.

Le fil « Session roulement 21 → Dégât aiguillage 21a → Entretien 22 → Entretien 25 »
s'implémente par les **notes liées** ; les « À faire » deviennent des **tâches Todoist**.

Trois observations issues de ce tableau :

1. La documentation générale (norme, tutoriel, exemple) n'a **pas d'objet** — elle est
   qualifiée par sa catégorie et ses seuls thèmes. C'est normal et voulu : elle est
   intemporelle et non rattachée à une instance. C'est le cas où la racine `Écartement`
   prend tout son sens.
2. **Les catégories multiples ne sont pas marginales** : six des vingt cas en portent
   plusieurs. Les deux premiers notés en gras existaient déjà dans le mindmap d'origine et
   étaient jusqu'ici écrasés par la mono-valuation.
3. Les trois lignes « bâtiments » illustrent les **deux populations de documentation** : le
   plan de la halle a un objet (l'instance existe), l'article sur les maisons de garde n'en a
   pas (le type seul est documenté), le tutoriel non plus. Un même thème
   `Bâtiments/Halle marchandises` les réunit, quel que soit leur ancrage.

---

## 8. Séquence de mise en place

> Le workspace existe déjà. Cette séquence vaut pour une **recréation à neuf** (ou pour un
> nouveau workspace bâti sur le même modèle). Pour faire évoluer l'existant, suivre
> `MIGRATION-categories.md` §8.

1. **Créer le workspace** · profondeur de filtre hiérarchique **6** — l'arbre Réseaux descend
   à 6 niveaux sur CFD (Réseaux → CFD → Compagnie 0m → Établissements → Gare → Aiguillage).
   Sans cela, un filtre ↑ depuis un aiguillage n'atteindrait pas CFD.
2. **Importer `objets.csv`**, puis vérifier les chemins courts sur quelques feuilles.
3. **Importer `themes-cible.csv`**. Vérifier que les **3** racines sont présentes et qu'aucune
   racine `Interventions` n'a été créée.
4. **Importer `categories.csv`** (19 catégories), puis vérifier les portées.
5. **Créer les éléments** projets (§4).
6. **Créer les 7 schémas** (§6), puis **valider chacun au simulateur** de la page de gestion.
7. **Vérifier la cohérence des clés** (requête §5.3 de `MIGRATION-categories.md`) avant
   d'activer la fusion.
8. **Saisir 4 notes témoins** — un contrôle technique, une session de roulement, une fiche
   Descriptif, et **une note à deux catégories** — et vérifier que la fusion produit bien
   l'union dédupliquée.
9. **Reprise historique** : créer d'abord les Descriptifs du parc existant (ils constituent
   l'inventaire), puis les notes de journal au fil de l'eau.

### Évolutions à envisager côté code

| Priorité | Évolution | Justification |
|---|---|---|
| **Haute** | **Filtre par élément** (multi-select plat) en Bibliothèque, Calendrier et fiche objet | Conditionne l'usage « projets ». Prévu au CDC §4 bis mais non implémenté. Coût faible : pas de récursion ni de direction. Permettrait aussi de rapatrier l'écartement depuis les thèmes. |
| Moyenne | **Validateur d'unicité des clés** de données étendues | Condition de validité de la fusion. Voir `MIGRATION-categories.md` §5.3. |
| Basse | Dictionnaire de champs (`jd_champ`) | Remplace la convention par une garantie, et ouvre l'analyse transversale des valeurs. |
| Basse | Groupement visuel des racines dans le sélecteur de thèmes | Confort : 3 racines et 97 thèmes dans une même liste. |
| Basse | Affichage de l'inventaire de parc comme vue dédiée | Aujourd'hui obtenu via Bibliothèque + filtre catégorie *Descriptif* + export CSV. |

> Le flag `resolvant` sur les thèmes racines, envisagé dans la version précédente de ce
> document, **est sans objet** : la migration retire la cause du problème plutôt que de le
> contourner.

---

## 9. Points ouverts

- **CFD à peupler** : les deux compagnies n'ont que leurs établissements amorcés ; lignes,
  sections et ouvrages d'art restent à créer. Le réseau étant à l'état de projet, l'arbre se
  complétera au fil de la conception.
- **CFG2 — établissements incomplets** : Gare « Aval », Remise, stations La Creuse et La
  Bosse n'ont pas leurs aiguillages détaillés (le mindmap s'arrêtait à « … »).
- **Aiguillages en pleine voie** : le modèle les place sous l'établissement. Ceux situés hors
  établissement se rattachent à la section de ligne correspondante.
- **Composants du réseau d'extérieur** : trois thèmes ont été ajoutés au mindmap (drainage,
  soutènement, hivernage). CFG2 étant le réseau le plus développé, cette branche mérite
  d'être complétée à l'usage.
- **Couleurs des catégories** : les 19 valeurs de `categories.csv` sont une première passe
  cohérente par famille, à ajuster visuellement.
- **Devise** des schémas 5, 6, 7 : CHF supposé, à ajuster.

*Tranchés* : les ouvrages d'art relèvent de la **compagnie** (indissociables de leur ligne) ;
CFG2 est bien un **réseau de jardin**, ce qui valide la branche `Réseau d'extérieur` ; les
**types de bâtiments sont maintenus** (voir §3.1) ; les **catégories sont multiples** et
leurs schémas **fusionnent** (voir §6.1).
