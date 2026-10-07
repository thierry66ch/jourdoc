# Handoff — Refonte de la catégorisation JourDoc

> Note de cadrage à lire **en premier**.
> 7 octobre 2026 · Thierry / JourDoc V2

---

## En une phrase

Les « interventions » du journal sont aujourd'hui stockées comme des thèmes, ce qui est une
erreur de cardinalité ; elles deviennent des **catégories**, dans un référentiel unifié avec
celles de la documentation, **multi-valuées**, dont les schémas de données étendues
**fusionnent**.

---

## Quel document décrit quel état

| Document | État décrit | Rôle |
|---|---|---|
| `README-handoff.md` | — | ce fichier : par où commencer |
| **`MIGRATION-categories.md`** | **avant → après** | **la spec à implémenter** — DDL, migration SQL, fusion, impacts applicatifs |
| `CDC-Workspace-Modelisme.md` | **après** | structure cible du workspace Modélisme |
| `objets.csv` | inchangé | arbre des objets — non affecté par la migration |
| `themes.csv` | **avant** | ce qui a été importé à l'origine, racine `Interventions` comprise. **Archive — ne pas réimporter.** |
| `themes-cible.csv` | **après** | arbre des thèmes sans la racine `Interventions` (97 thèmes, 3 racines) |
| `categories.csv` | **après** | les 19 catégories avec leur portée |

Documents de référence dans le projet claude.ai : `CDC-JourDoc.md` (V2.1) et
`GUIDE-UTILISATEUR.md`.

---

## Ordre de lecture

1. Ce fichier.
2. `MIGRATION-categories.md` §1 et §2 — le problème et la cible.
3. `MIGRATION-categories.md` §3 à §6 — DDL, migration, fusion, impacts.
4. `CDC-Workspace-Modelisme.md` — seulement si le contexte métier est nécessaire.

---

## Ce qui est décidé

- **Une table `jd_categorie`** par workspace, remplaçant `jd_doc_categorie` et absorbant la
  racine de thèmes `Interventions`.
- **Portée déclarée** par trois booléens : observation, activité, documentation. Défaut à
  `TRUE`, portée vide interdite. C'est le mécanisme qui couvre à la fois « journal ou doc »
  et « observation ou activité ».
- **Multi-valuation** via une table de liaison `note_categorie` avec un `ordre`. Pas de
  catégorie principale : la Bibliothèque affiche le document sur toutes ses étagères, le
  titre liste toutes les catégories, les schémas fusionnent. L'`ordre` sert uniquement à
  l'affichage (couleur de pastille, tête du titre).
- **Fusion des schémas** : union des champs des schémas de chaque catégorie, dédupliqués par
  `cle`. Une note mono-catégorie se comporte exactement comme aujourd'hui.
- **`nature` conservée**, avec une `nature_defaut` portée par la catégorie.
- **Libellé contextuel** dans l'UI : « Apports » côté documentation, « Interventions » côté
  journal. Le nom technique reste `categorie`.
- **Phases fusionnées** : le mono-valué transitoire est abandonné, les deux chantiers
  touchant les mêmes requêtes.

---

## Ce qui reste à arbitrer

Aucun de ces points ne bloque le démarrage.

| Point | Où | Défaut si non tranché |
|---|---|---|
| Pastille du calendrier : couleur de la 1ʳᵉ catégorie seule, ou catégorie + nature ? | MIGRATION §6.2 | couleur de la 1ʳᵉ catégorie |
| Valeurs devenues hors schéma : masquées ou signalées ? | MIGRATION §5.4 | conservées, masquées |
| Unicité des clés : validateur ou table `jd_champ` ? | MIGRATION §5.3 | validateur |
| Hiérarchie des catégories | MIGRATION §3.1 | colonne posée, non exploitée |
| Couleurs des 19 catégories | `categories.csv` | valeurs proposées, à ajuster |

---

## Trois pièges

**1. L'ordre des étapes de migration n'est pas commutatif.** La bascule des schémas
(étape 4) doit précéder la suppression des thèmes d'intervention (étapes 5 et 6), sinon les
`theme_id` référencés ont disparu et l'`UPDATE` ne trouve plus rien.

**2. Les noms de tables de la spec viennent du CDC, pas du code.** `jd_doc_categorie`,
`note_theme`, `schema_donnees` : vérifier chacun contre le schéma réel avant d'exécuter quoi
que ce soit.

**3. Le workspace Jardin ne se migre pas automatiquement.** Ses interventions (semer,
planter, récolter, tailler…) ne sont pas isolées sous une racine dédiée : elles cohabitent
avec les thèmes-sujets dans un arbre unique. Un mapping manuel thème → catégorie est à
établir avec Thierry. C'est aussi le test de généralisation du modèle avant d'ouvrir les
contextes Cuisine, Ménage et Santé.

---

## Premier pas recommandé

Avant tout DDL, exécuter en lecture seule sur la base actuelle la requête de détection des
conflits de clés (`MIGRATION-categories.md` §5.3). Elle prend une seconde et conditionne la
faisabilité de la fusion : si des clés homonymes portent des types divergents, il faut les
aligner d'abord.

Puis le rapport préalable (§4.1), qui liste les notes de journal sans intervention — le seul
cas nécessitant un arbitrage humain.

---

## Format des CSV

Séparateur `;`, encodage UTF-8, en-tête en première ligne, parents résolus **par nom**
(d'où l'unicité globale des noms dans chaque fichier) et toujours déclarés avant leurs
enfants.

- `objets.csv`, `themes-cible.csv` : `nom;parent;nom_court;est_individu;description`
- `categories.csv` : `nom;emoji;couleur;applique_observation;applique_activite;applique_documentation;nature_defaut;ordre`
  (booléens en `0`/`1`, `nature_defaut` vide ou `observation` / `activite` / `mixte`)

Si l'import réel attend d'autres colonnes, l'adaptation est mécanique — aucune donnée ne
manque.
