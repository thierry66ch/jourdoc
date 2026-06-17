# Module JourDoc — documentation technique

## Concept

JourDoc est un bloc-notes de terrain liant des **notes** (journal/documentation) à des **objets** (hiérarchie groupes→individus) et des **thèmes** (hiérarchie sujets), avec médias, tâches Todoist et vues comparatives pluriannuelles.

## Composants clés

### Shell et navigation

**`JourDocApp.jsx`**
- Shell : TopBar + sidebar nav + Outlet
- Gère le workspace switcher (portal pour le menu mobile)
- Sync Todoist silencieuse au montage + `visibilitychange` (throttle 1 min / workspace via `sessionStorage`)
- Navigation automatique vers `/todoist-tasks` si sync détecte des tâches complétées
- La route `/analyse` reçoit la classe `jd-main--wide` (max-width: none)

**`hooks.js`**
- `useJdData(wsId, token)` → charge objets et thèmes en parallèle, fournit `{objets, themes, loading, reload}`
- `authHeader(token)` → `{ Authorization: 'Bearer ...', 'Content-Type': 'application/json' }`
- `buildPathMap(items)` → `Map<id, 'chemin/court'>` pour afficher les chemins hiérarchiques

### Notes

**`NoteForm.jsx`**
- Création et édition
- Auto-génération du titre : `objets.map(o.nom).join(', ') + ' → ' + theme.nom`
- Titre alt : mêmes noms courts séparés par `, ` (correction §2.6)
- Sélection date avec flèches ±1 jour (§2.7 — déjà présent)
- HierarchyPicker en mode multi pour les objets, single pour le thème
- MediaPicker filtré par date (jour courant, non liés par défaut)
- Section Todoist (créer/lier tâche) — si workspace configuré

**`NoteView.jsx`**
- Vue lecture 2 colonnes (desktop) : colonne principale + sidebar (médias, fil de notes, Todoist)
- `refreshNote()` callback passé à `TodoistPanel` pour éviter `window.location.reload()`
- Lightbox sur photos ET PDFs (iframe inline)
- Navigation contextuelle (noteIds transmis depuis les vues liste)
- Swipe horizontal pour naviguer dans le contexte

**`NoteCard.jsx`**
- Affichage compact : badge nature/type, thème, objets (chips cliquables), vignettes médias
- Prop `showDate` → affiche `note.date` (activée dans ObjetDetail, ThemeDetail)
- Chip Todoist : priorité, échéance, statut terminé

### Hiérarchie objets/thèmes

**`ObjetManager.jsx` / `ThemeManager.jsx`**
- Arbre inline : afficher, renommer, ajouter enfant, changer de parent (insertion niveau intermédiaire)
- Import CSV (`;` ou `,`, BOM, commentaires `#`, format nom+parent ou chemin hiérarchique)

**`ObjetDetail.jsx`**
- Notes récursives via route `/objets/:id/notes?direction=both/down/up`
- Filtres : thème (avec descendants), type (Journal/Documentation), portée
- `showDate` activé sur les NoteCards

**`ThemeDetail.jsx`**
- Notes récursives via route `/themes/:id/notes?direction=both/down/up` (JS hierarchy côté serveur)
- Filtres : objet (avec descendants), type, portée

### Calendrier

**`CalendarView.jsx`**
- Container des 5 modes : `year` | `month` | `week` | `last7` | `matrix`
- État URL : `?mode=...&anchor=...` (navigate(-1) restaure le contexte)
- Filtres object + thème avec HierarchyPicker + direction, sur modes mois et année
- Swipe tactile sur tous les modes sauf matrix (±1 période)

**Modes :**
- `CalendarMonth` : grille 7×N, dots colorés, popup CSS :hover, panneau jour sélectionné
- `CalendarYear` : grille semaines par mois, dots, popup CSS :hover via `createPortal` non
- `CalendarWeek` / last7 : colonnes 7 jours, NoteCard compacts
- `ObjectMatrix` : objets × jours, grid CSS sticky, scroll horizontal

**`AnalyseView.jsx`** (§7.3)
- 52 buckets hebdomadaires × N années
- Filtres objet + thème + nature (documentation exclue systématiquement)
- Clic colonne → surlignade cross-année (highlightCol state)
- Marqueur semaine courante (today bucket dans l'année en cours)
- Popup via `createPortal` + `position:fixed` : plage dates semaine + dot nature + date note
- `.jd-main--wide` : max-width supprimé pour profiter de toute la largeur

### Médias

**`MediaGallery.jsx`**
- Upload drag-drop + sélection multiple
- Filtres : date (plage glissante), type (photo/pdf), lié/non-lié
- Sélection multiple → créer note avec médias pré-attachés
- Lightbox : images (carousel) + PDFs (iframe inline)

**Traitement serveur :**
- `POST /:wsId/medias` : multipart → sharp (resize ≤1600px, EXIF) → HEIC fallback → UUID filename
- Détection magic bytes : `FF D8` = JPEG, `ftyp` = HEIC

### Todoist

**`TodoistPanel.jsx`** (dans NoteView sidebar)
- Créer une tâche (titre, échéance, priorité P1-P4, récurrence texte libre)
- Lier une tâche existante via URL — extraction de l'ID depuis slug moderne `nom-kebab-TASKID` (dernier segment avec majuscules ≥8 chars)
- Statut polling, terminer, importer (date+titre+URL Todoist+commentaires → fin du contenu HTML)
- Note de suivi : nouvelle note pré-remplie avec lien vers l'origine
- `onNoteUpdated` prop : callback NoteView pour re-fetch sans `window.location.reload()`

**`TodoistTasks.jsx`** (page `/todoist-tasks`)
- Sections : 🔔 À traiter (done=1 non consignées + recurrence_done=1) | ⏳ En cours | ✅ Traités
- Actions inline : Consigner (import) → `tache_todoist_consigne = 1` → section Traités
- Récurrentes : après Consigner → `recurrence_done = 0` → retour En cours

**Sync batch (`POST /:wsId/todoist/sync`) :**
- Interroge toutes les tâches `done=0` du workspace
- Détecte : terminées (404 API), récurrentes (due date avancée), toujours actives
- Stocke `tache_todoist_content` (titre) à chaque sync

## Routes serveur JourDoc (résumé)

Voir `docs/dev/api.md` pour le détail complet.

| Groupe | Routes |
|---|---|
| Objets | GET/POST `/:wsId/objets`, PUT/DELETE `/:wsId/objets/:id`, GET `/:wsId/objets/:id/notes?direction=` |
| Thèmes | GET/POST `/:wsId/themes`, PUT/DELETE `/:wsId/themes/:id`, GET `/:wsId/themes/:id/notes?direction=` |
| Notes | GET/POST `/:wsId/notes`, GET/PUT/DELETE `/:wsId/notes/:id`, GET `/:wsId/notes/search` |
| Liaisons | POST/DELETE `/:wsId/notes/:id/liens/:cibleId` |
| Médias | POST/GET `/:wsId/medias`, GET `/:wsId/medias/:id/notes` |
| Todoist WS | GET/PUT `/:wsId/todoist`, POST `/:wsId/todoist/sync`, GET `/:wsId/todoist/tasks` |
| Todoist note | POST/DELETE/GET `/:wsId/notes/:id/todoist`, POST `.../close`, `.../link`, `.../import`, `.../details` |
| Analyse | GET `/:wsId/analyse?objet_id=&objet_dir=&theme_id=&theme_dir=&nature=` |
| Import | POST `/:wsId/import/objets`, `/:wsId/import/themes` |
| Workspaces | GET/POST `/workspaces`, PATCH/DELETE `/:wsId`, GET/POST/PUT/DELETE `/:wsId/members` |
