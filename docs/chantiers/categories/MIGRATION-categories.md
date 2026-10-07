# JourDoc — Migration « Catégories unifiées et multiples »

> Spécification de migration · version fusionnée
> Objet : extraire les interventions des thèmes, unifier le référentiel de catégorisation
> journal + documentation en une table unique à portée déclarée, et passer la catégorisation
> en relation N–N avec fusion des schémas de données étendues.
> Établi le 6 octobre 2026, révisé le 7 octobre 2026 · Destiné au handoff Claude Code
> Références : `CDC-JourDoc.md` (V2.1), `CDC-Workspace-Modelisme.md`

---

## 1. Problème traité

Le modèle actuel qualifie les notes de documentation par un champ dédié
(`doc_categorie_id`, référentiel ouvert par workspace) mais les notes de journal par un
simple enum à trois valeurs (`nature`). Le besoin d'une qualification fine côté journal a
donc été couvert en détournant l'axe **thème** : une racine `Interventions` dont le premier
élément sélectionné sert de thème principal et résout le schéma de données étendues.

C'est une erreur de cardinalité. Un thème est N–N par construction ; une intervention est
unique par note. Le modèle compense par une convention de saisie (« sélectionner
l'intervention en premier ») et par le cache `notes.theme_id`, c'est-à-dire qu'il reconstruit
une contrainte d'unicité par discipline utilisateur.

**Constat empirique** (workspace Modélisme, plusieurs semaines d'usage) : les 7 schémas de
données étendues se résolvent par `objet + intervention` ou `objet + catégorie doc`. **Aucun
ne se résout par un thème au sens « sujet »**. L'axe résolvant n'a jamais été le thème.

**Second constat**, côté documentation : la mono-valuation force des arbitrages artificiels.
Ce qui est catégorisé n'est pas la *forme* du document (revue, livre, fiche — indifférente)
mais son **apport** : une même notice d'appareil est à la fois un manuel, un descriptif et un
recueil de conseils, et le même contenu se présente tantôt en un document, tantôt en deux.
L'apport est légitimement multiple.

## 2. Cible

Une table unique `jd_categorie`, remplaçant `jd_doc_categorie` et absorbant la racine de
thèmes `Interventions`. Chaque catégorie déclare son **domaine d'application** parmi trois
contextes : observation, activité, documentation. Une note porte **une ou plusieurs**
catégories, via une table de liaison.

Les quatre axes de qualification deviennent orthogonaux :

| Axe | Question | Cardinalité |
|---|---|---|
| **Objet** | sur quoi ? | N (avec un principal) |
| **Catégorie** | ce que ça apporte (doc) / ce qu'on a fait (journal) | N |
| **Thèmes** | à propos de quoi ? | N |
| **Éléments** | marquage transversal | N |

Après migration, l'arbre des thèmes porte un sens unique et identique pour le journal et la
documentation : *de quoi ça parle*.

### 2.1 Pas de catégorie principale

Trois mécanismes auraient pu exiger une catégorie désignée principale. Aucun ne le fait :

| Mécanisme | Résolution retenue |
|---|---|
| Bibliothèque | le document apparaît sur **toutes** les étagères correspondant à ses catégories |
| Titre auto-généré | **toutes** les catégories sont listées |
| Schéma de données étendues | **fusion** des schémas de toutes les catégories (§5) |

Il n'y a donc **pas de FK `categorie_id` sur `notes`**, seulement une table de liaison. Le
seul besoin résiduel est d'affichage — la pastille du calendrier ne porte qu'une couleur — et
il est couvert par une colonne `ordre` dans la liaison : la première catégorie donne la
couleur et mène le titre. C'est une convention d'affichage, pas une contrainte de modèle.

### 2.2 Terminologie

Le nom `categorie` est conservé dans le modèle et le code. Le pluriel de catégories est un
usage courant et ne promet pas l'exclusivité ; surtout, l'axe sert **deux questions
distinctes** réunies par leur rôle structurel et non par leur sens, de sorte qu'aucun terme
précis ne conviendrait aux deux moitiés.

En revanche le **libellé affiché est contextuel**, la portée déclarée indiquant déjà dans
quel contexte on se trouve :

- côté documentation → **« Apports »**
- côté journal → **« Interventions »**

---

## 3. DDL

> Les noms de tables suivent le CDC. **Les aligner sur le schéma réel** avant exécution.

### 3.1 Table `jd_categorie`

```sql
CREATE TABLE jd_categorie (
  id                      SERIAL PRIMARY KEY,
  workspace_id            INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id               INTEGER REFERENCES jd_categorie(id) ON DELETE SET NULL,
  nom                     TEXT    NOT NULL,
  emoji                   TEXT,
  couleur                 TEXT,
  applique_observation    BOOLEAN NOT NULL DEFAULT TRUE,
  applique_activite       BOOLEAN NOT NULL DEFAULT TRUE,
  applique_documentation  BOOLEAN NOT NULL DEFAULT TRUE,
  nature_defaut           TEXT,
  ordre                   INTEGER NOT NULL DEFAULT 0,
  actif                   BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT cat_nom_unique_ws UNIQUE (workspace_id, nom),

  CONSTRAINT cat_portee_non_vide CHECK (
    applique_observation OR applique_activite OR applique_documentation
  ),

  CONSTRAINT cat_nature_defaut_valide CHECK (
    nature_defaut IS NULL OR nature_defaut IN ('observation','activite','mixte')
  ),

  CONSTRAINT cat_nature_defaut_coherente CHECK (
    nature_defaut IS NULL
    OR (nature_defaut = 'observation' AND applique_observation)
    OR (nature_defaut = 'activite'    AND applique_activite)
    OR (nature_defaut = 'mixte'       AND applique_observation AND applique_activite)
  )
);

CREATE INDEX idx_categorie_ws      ON jd_categorie (workspace_id, actif);
CREATE INDEX idx_categorie_parent  ON jd_categorie (parent_id);
```

**Portée.** Les trois booléens couvrent à la fois « journal ou documentation » et
« observation ou activité ». Défaut à `TRUE` partout : une catégorie créée sans précision est
universelle, sans recourir à un NULL implicite. La portée vide est interdite.

**Nature par défaut.** Nullable, et utile seulement dans le cas ambigu : une catégorie
ouverte à l'observation *et* à l'activité peut pré-sélectionner l'une des deux, ou `mixte`.
Quand la portée journal est univoque, la nature se dérive et le champ reste NULL.

**Hiérarchie.** `parent_id` est posé dès maintenant mais **non exploité** : aucune catégorie
n'est créée avec un parent. Profondeur maximale 2, à garantir côté applicatif. Si la
hiérarchie est activée plus tard, un schéma posé sur une catégorie parente doit descendre sur
ses enfants, par cohérence avec les objets et les thèmes.

**Suppression.** Préférer `actif = FALSE` à un `DELETE` : la suppression d'une catégorie
retire silencieusement la qualification de toutes les notes concernées et orpheline leurs
données étendues (§5.4).

### 3.2 Table de liaison `note_categorie`

```sql
CREATE TABLE note_categorie (
  note_id       INTEGER NOT NULL REFERENCES notes(id)        ON DELETE CASCADE,
  categorie_id  INTEGER NOT NULL REFERENCES jd_categorie(id) ON DELETE CASCADE,
  ordre         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (note_id, categorie_id)
);

CREATE INDEX idx_note_categorie_cat ON note_categorie (categorie_id);
```

`ordre` fixe l'ordre d'affichage : première catégorie = couleur de pastille et tête du titre.

**Aucune colonne `categorie_id` n'est ajoutée à `notes`.** `doc_categorie_id` est en revanche
**conservée pendant toute la phase de migration** (rollback), puis supprimée une fois la
nouvelle structure validée en production.

### 3.3 Table `schema_donnees`

```sql
ALTER TABLE schema_donnees ADD COLUMN categorie_id INTEGER
  REFERENCES jd_categorie(id) ON DELETE CASCADE;
```

Les axes de contexte restent au nombre de quatre : `objet_id`, `theme_id`, `categorie_id`,
`nature`. `doc_categorie_id` est conservée puis supprimée comme ci-dessus.

Contrainte d'unicité à reconstruire :

```sql
ALTER TABLE schema_donnees DROP CONSTRAINT <nom_contrainte_actuelle>;

ALTER TABLE schema_donnees ADD CONSTRAINT schema_contexte_unique
  UNIQUE NULLS NOT DISTINCT (workspace_id, objet_id, theme_id, categorie_id, nature);
```

> `theme_id` est conservé comme axe de contexte bien qu'aucun schéma ne l'utilise
> aujourd'hui. Le retirer serait prématuré : un schéma piloté par un composant reste
> concevable (p. ex. des mesures propres à un type d'ouvrage).

---

## 4. Migration des données

### 4.1 Rapport préalable — à produire AVANT toute écriture

Un seul cas ne se migre pas automatiquement :

```sql
-- Notes de journal SANS thème d'intervention → aucune catégorie après migration
SELECT n.id, n.date, n.titre, n.nature
FROM notes n
WHERE n.type = 'journal'
  AND NOT EXISTS (
    SELECT 1 FROM note_theme nt
    JOIN themes t ON t.id = nt.theme_id
    WHERE nt.note_id = n.id
      AND t.parent_id = (SELECT id FROM themes
                         WHERE workspace_id = :ws AND parent_id IS NULL
                           AND nom_court = 'int')
  )
ORDER BY n.date DESC;
```

> Le cas « plusieurs interventions sur une même note », qui aurait exigé un arbitrage avec la
> cible mono-valuée, **ne pose plus de problème** : les deux interventions deviennent deux
> catégories de la note. C'est un bénéfice direct du N–N.

Produire aussi, à titre informatif, la liste des notes qui auront plusieurs catégories — elle
valide a posteriori la décision de multi-valuation :

```sql
SELECT n.id, n.titre, string_agg(t.nom, ' + ' ORDER BY t.nom) AS interventions
FROM notes n
JOIN note_theme nt ON nt.note_id = n.id
JOIN themes t      ON t.id = nt.theme_id
WHERE n.type = 'journal'
  AND t.parent_id = (SELECT id FROM themes ...)   -- racine Interventions
GROUP BY n.id, n.titre
HAVING count(*) > 1;
```

### 4.2 Étapes

Exécuter dans une transaction unique, après sauvegarde.

**Étape 1 — reprise des catégories de documentation**

```sql
INSERT INTO jd_categorie
  (workspace_id, nom, emoji, couleur, ordre, actif,
   applique_observation, applique_activite, applique_documentation)
SELECT workspace_id, nom, emoji, couleur, ordre, actif,
       FALSE, FALSE, TRUE
FROM jd_doc_categorie;
```

**Étape 2 — reprise des interventions**

Pour le **workspace Modélisme**, les interventions sont les enfants directs de la racine de
thèmes `Interventions` (`nom_court = 'int'`, `parent_id IS NULL`).

```sql
INSERT INTO jd_categorie
  (workspace_id, nom, ordre, actif,
   applique_observation, applique_activite, applique_documentation)
SELECT t.workspace_id, t.nom, 0, TRUE,
       TRUE, TRUE, FALSE      -- portée à affiner, cf. table ci-dessous
FROM themes t
WHERE t.parent_id = (SELECT id FROM themes
                     WHERE workspace_id = :ws AND parent_id IS NULL
                       AND nom_court = 'int');
```

Portées à appliquer ensuite pour le workspace Modélisme :

| Catégorie | obs. | act. | doc. | nature_defaut |
|---|:--:|:--:|:--:|---|
| Dégât | ✓ | | | — |
| Idée | ✓ | | | — |
| Visite | ✓ | | | — |
| Réflexion | | ✓ | | — |
| Construction | | ✓ | | — |
| Entretien | | ✓ | | — |
| Roulement | ✓ | ✓ | | `mixte` |
| Essai | ✓ | ✓ | | `activite` |
| Contrôle technique | ✓ | ✓ | | `activite` |
| Réparation | | ✓ | | — |
| Rénovation | | ✓ | | — |
| Achat | | ✓ | | — |

> ⚠️ **Le workspace Jardin ne se migre pas automatiquement.** Ses thèmes d'intervention
> (semer, planter, récolter, tailler, traiter…) ne sont pas isolés sous une racine dédiée :
> ils cohabitent avec les thèmes-sujets (maladie, ravageur…) dans un arbre unique. Un
> **mapping manuel** thème → catégorie est à établir avant de rejouer les étapes 2 à 5 sur ce
> workspace. C'est aussi la validation croisée du modèle sur le contexte d'origine, et le
> test à passer avant d'ouvrir cuisine, ménage et santé.

**Étape 3 — affectation des notes**

```sql
-- Documentation
INSERT INTO note_categorie (note_id, categorie_id, ordre)
SELECT n.id, c.id, 0
FROM notes n
JOIN jd_doc_categorie d ON d.id = n.doc_categorie_id
JOIN jd_categorie c ON c.workspace_id = d.workspace_id AND c.nom = d.nom;

-- Journal : chaque thème d'intervention devient une catégorie
INSERT INTO note_categorie (note_id, categorie_id, ordre)
SELECT n.id, c.id, row_number() OVER (PARTITION BY n.id ORDER BY t.nom) - 1
FROM notes n
JOIN note_theme nt  ON nt.note_id = n.id
JOIN themes t       ON t.id = nt.theme_id
JOIN jd_categorie c ON c.workspace_id = t.workspace_id AND c.nom = t.nom
WHERE n.type = 'journal'
  AND t.parent_id = (SELECT id FROM themes
                     WHERE workspace_id = :ws AND parent_id IS NULL
                       AND nom_court = 'int');
```

**Étape 4 — bascule des schémas** *(obligatoirement avant les étapes 5 et 6)*

```sql
-- Schémas pilotés par une catégorie de documentation
UPDATE schema_donnees s
SET categorie_id = c.id
FROM jd_doc_categorie d
JOIN jd_categorie c ON c.workspace_id = d.workspace_id AND c.nom = d.nom
WHERE s.doc_categorie_id = d.id;

-- Schémas pilotés par un thème d'intervention
UPDATE schema_donnees s
SET categorie_id = c.id, theme_id = NULL
FROM themes t
JOIN jd_categorie c ON c.workspace_id = t.workspace_id AND c.nom = t.nom
WHERE s.theme_id = t.id
  AND t.parent_id = (SELECT id FROM themes ...);   -- racine Interventions
```

⚠️ Si les thèmes sont supprimés d'abord, les `theme_id` référencés auront disparu et la
bascule échouera silencieusement.

**Étape 5 — nettoyage des liaisons de thèmes**

```sql
DELETE FROM note_theme nt
USING themes t
WHERE t.id = nt.theme_id
  AND t.parent_id = (SELECT id FROM themes ...);   -- racine Interventions
```

**Étape 6 — suppression de la racine de thèmes**

```sql
DELETE FROM themes
WHERE workspace_id = :ws
  AND (nom_court = 'int' AND parent_id IS NULL
       OR parent_id = (SELECT id FROM themes ...));
```

### 4.3 Vérifications post-migration

```sql
-- Notes de journal sans aucune catégorie (hors cas arbitrés)
SELECT count(*) FROM notes n
WHERE n.type = 'journal'
  AND NOT EXISTS (SELECT 1 FROM note_categorie WHERE note_id = n.id);

-- Tous les schémas portent bien un axe catégorie
SELECT id, nom, objet_id, theme_id, categorie_id, nature FROM schema_donnees;

-- Cohérence portée / nature
SELECT n.id, n.nature, c.nom
FROM notes n
JOIN note_categorie nc ON nc.note_id = n.id
JOIN jd_categorie c    ON c.id = nc.categorie_id
WHERE n.type = 'journal'
  AND (  (n.nature = 'observation' AND NOT c.applique_observation)
      OR (n.nature = 'activite'    AND NOT c.applique_activite));
```

Attendu pour le workspace Modélisme : 7 schémas, tous avec `categorie_id` renseigné et
`theme_id` à NULL.

---

## 5. Fusion des schémas de données étendues

### 5.1 Principe

Une note portant plusieurs catégories applique **l'union des champs** des schémas de chacune,
dédupliqués par leur clé. Seul l'axe catégorie fusionne ; les autres axes continuent de
participer à la résolution de chaque schéma selon la règle de spécificité actuelle.

L'enjeu n'est pas le confort mais l'**évitement de l'explosion combinatoire** : sans fusion,
qualifier une note « Manuel + Conseil » imposerait de créer un schéma `Manuel et conseil`
distinct, puis un autre pour chaque combinaison rencontrée — 2ⁿ schémas à maintenir là où n
suffisent.

### 5.2 Algorithme

```
champs_applicables(note) :
    schemas ← []
    pour chaque catégorie c de note, par `ordre` croissant :
        s ← resoudre_schema(objet_principal = note.objet_principal,
                            categorie       = c,
                            nature          = note.nature)
        si s ≠ ∅ : schemas.ajouter(s)

    si schemas est vide :                       # repli sur le joker
        s ← resoudre_schema(objet_principal, categorie = NULL, nature)
        si s ≠ ∅ : schemas ← [s]

    champs ← []  ;  vus ← ∅
    pour chaque s de schemas :
        pour chaque champ ch de s :
            si ch.cle ∉ vus :
                champs.ajouter(ch)  ;  vus.ajouter(ch.cle)
    retourner champs
```

`resoudre_schema` est la fonction actuelle, inchangée : contexte le plus spécifique, l'objet
primant à égalité.

**Propriété de compatibilité** : une note à une seule catégorie produit exactement le même
résultat qu'aujourd'hui. La fusion est une généralisation, pas un changement de régime.

**Ordre des champs** : ordre des catégories, puis ordre interne de chaque schéma. La première
occurrence d'une clé fixe sa position.

### 5.3 Condition de validité — unicité sémantique des clés

La déduplication par `cle` suppose qu'une même clé désigne partout la même donnée. Rien ne le
garantit aujourd'hui : les champs sont définis inline dans le JSON de chaque schéma. Si
`notation` est une échelle 1–5 dans un schéma et une liste `[faible, moyen, fort]` dans un
autre, la fusion est indécidable.

**Parade retenue — validateur à l'enregistrement.** Refuser un schéma qui réutilise une `cle`
déjà présente dans le workspace avec un `type`, des `options` ou une `unite` différents.
Message d'erreur nommant le schéma en conflit.

Requête de détection sur l'existant (champs en `jsonb`) :

```sql
SELECT c->>'cle' AS cle,
       count(DISTINCT c->>'type')  AS variantes_type,
       array_agg(DISTINCT s.nom)   AS schemas_concernes
FROM schema_donnees s, jsonb_array_elements(s.champs) AS c
WHERE s.workspace_id = :ws
GROUP BY c->>'cle'
HAVING count(DISTINCT c->>'type') > 1
    OR count(DISTINCT c->'options'::text) > 1;
```

À exécuter avant activation de la fusion : tout conflit doit être résolu, soit en alignant les
définitions, soit en renommant l'une des clés.

**Cible à terme — dictionnaire de champs.** Une table `jd_champ` (workspace, cle, label, type,
options, unite) référencée par les schémas remplacerait la convention par une garantie
structurelle, et ouvrirait l'analyse transversale (« toutes les notations, tous schémas
confondus »). Plus coûteux ; à envisager si le nombre de schémas croît.

### 5.4 Valeurs orphelines

Retirer une catégorie d'une note laisse sans schéma les valeurs des champs qui lui étaient
propres. **Politique retenue : conservation silencieuse.** Les valeurs restent stockées et
réapparaissent si la catégorie est remise. Une donnée saisie ne doit pas être détruite par un
changement de qualification.

Option d'affichage à arbitrer : signaler ces valeurs dans un bloc « hors schéma » replié,
avec une action de suppression explicite.

### 5.5 Validation sur les schémas du workspace Modélisme

Note sur Loco 1 qualifiée `Contrôle technique + Essai` :

| Source | Champs |
|---|---|
| Schéma 1 (Contrôle technique) | bandages, prises, moteurs, magnets, attelages, eclairage, pantographes, **remarques** |
| Schéma 2 (Essai) | resultat, vitesse_min, **remarques** |
| **Fusion** | 11 champs — `remarques` dédupliqué (même clé, même type `texte`) |

Le premier cas réel soumis à l'algorithme contient déjà une clé partagée, et elle se résout
sans ambiguïté.

---

## 6. Impacts applicatifs

### 6.1 Saisie

- Le **sélecteur de catégories** remonte dans le bloc d'en-tête de la note, à côté de la date
  et de la nature. Multi-sélection, avec réordonnancement possible (la première mène le titre
  et donne la couleur).
- Libellé contextuel : **« Apports »** en documentation, **« Interventions »** en journal.
- La liste proposée est **filtrée par le contexte courant** : `applique_documentation` pour
  une note de doc, `applique_observation` / `applique_activite` selon la nature.
- **Les deux sens de saisie doivent fonctionner** : nature puis catégories (la liste se
  filtre), ou catégories puis nature (`nature_defaut` pré-remplit ; une note portant une
  catégorie d'observation et une catégorie d'activité suggère `mixte`).
- Le formulaire de données étendues se recompose à chaque ajout ou retrait de catégorie.
  **Grouper les champs par catégorie d'origine**, en sections repliables — une note à quatre
  catégories peut dépasser trente champs.
- Le sélecteur de thèmes perd sa racine `Interventions`, son thème déterminant et l'affichage
  associé. **Le flag `resolvant` envisagé devient sans objet** : la cause est retirée.

### 6.2 Vues

- **Bibliothèque** : un document apparaît sur **toutes** les étagères de ses catégories. Les
  compteurs par catégorie ne sont donc plus une partition — un même document pèse sur
  plusieurs étagères et la somme des compteurs dépasse le nombre de documents. À assumer
  explicitement dans l'affichage (« 14 documents », pas « 14 au total »).
- **Calendrier / Journal** : pastille colorée par la **première catégorie** (couleur + emoji),
  la nature pouvant rester comme second signal visuel (forme, bordure). À arbitrer.
- **Fiche objet, Analyse** : filtre catégorie à étendre à toutes les notes, aujourd'hui
  réservé à la documentation. Sémantique « au moins une des catégories sélectionnées ».

### 6.3 Titre auto-généré

Format `catégories — objets → thèmes`, les catégories séparées par des virgules dans l'ordre
de la liaison :

```
Entretien, Réparation — Aiguillage 21a → Voie
Manuel, Conseil — Perceuse sur colonne
```

Le titre court applique la même règle avec les noms courts.

### 6.4 Export

La colonne `catégorie` de l'export CSV devient `catégories` (valeurs séparées par `|`, dans
l'ordre), étendue à toutes les notes. Les interventions disparaissent de la colonne thèmes.

---

## 7. Points ouverts

- **Pastille du calendrier** : couleur de la première catégorie seule, ou combinaison
  catégorie (couleur) + nature (forme) ?
- **Valeurs hors schéma** (§5.4) : masquées ou signalées dans un bloc replié ?
- **Dictionnaire de champs** (§5.3) : validateur maintenant, table `jd_champ` plus tard — ou
  directement la table ?
- **Hiérarchie des catégories** : colonne posée, non exploitée. À activer si le besoin se
  confirme.
- **Workspace Jardin** : mapping manuel thème → catégorie à établir.

---

## 8. Ordre d'exécution recommandé

1. DDL (§3) sur une copie de la base.
2. Détection des conflits de clés (§5.3) → résolution avant toute activation de la fusion.
3. Rapport préalable (§4.1) → arbitrage des notes sans intervention.
4. Migration workspace **Modélisme** (§4.2), vérifications (§4.3).
5. Implémentation de la fusion (§5.2) et du validateur de clés (§5.3).
6. Adaptation applicative (§6), recette sur la copie.
7. Mapping manuel puis migration workspace **Jardin**.
8. Bascule en production, `doc_categorie_id` conservée.
9. Après validation en usage réel : suppression de `doc_categorie_id` sur `notes` et
   `schema_donnees`, et de la table `jd_doc_categorie`.

> **Note de séquençage.** Une première version de cette spécification séparait une phase 1
> (catégorie unique) d'une phase 2 (catégories multiples). Les deux sont ici fusionnées : la
> décision de multi-valuation étant acquise, et les deux phases touchant exactement les mêmes
> requêtes — toutes celles qui lisent `note_theme` — les séparer reviendrait à payer deux fois
> la traversée du code et la recette.
