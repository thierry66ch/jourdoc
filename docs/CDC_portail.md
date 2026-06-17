# Cahier des charges — Portail apps.pogil.com

## Vue d'ensemble

Le portail est le point d'entrée unique de toutes les applications hébergées sur `apps.pogil.com`. Il gère l'authentification, les droits d'accès par app et par workspace, et présente à chaque utilisateur les applications auxquelles il est autorisé.

---

## 1. Authentification

### Utilisateurs classiques
- Login (email ou nom d'utilisateur) + mot de passe
- Session persistante avec token JWT (expiration configurable, ex. 7 jours)
- Déconnexion manuelle possible

### Compte administrateur
- Compte unique, stocké séparément de la table `users` (fichier de config ou table `admin` dédiée)
- Login + mot de passe + OTP envoyé par e-mail à chaque connexion
- Le code OTP expire après 10 minutes
- Accès à l'interface d'administration uniquement (pas aux apps utilisateurs)

---

## 2. Gestion des utilisateurs (interface admin)

### Opérations disponibles
- Créer un compte utilisateur (nom, email, mot de passe temporaire)
- Activer / désactiver un compte
- Réinitialiser le mot de passe (envoi d'un lien par e-mail)
- Supprimer un compte
- Assigner des apps et des workspaces à un utilisateur

### Modèle de permissions
```
Utilisateur → peut accéder à → App(s)
Utilisateur → peut accéder à → Workspace(s) dans chaque App
```

Un workspace peut être partagé entre plusieurs utilisateurs. Exemple :
- User A : JOURDOC → ws1 (privé), ws2 (partagé)
- User B : JOURDOC → ws2 (partagé), ws3 (privé)

---

## 3. Structure de la base de données

```sql
-- Utilisateurs
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Applications disponibles
CREATE TABLE apps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,  -- ex: "jourdoc", "garden"
  name        TEXT NOT NULL,         -- ex: "JourDoc", "Jardin"
  icon        TEXT,                  -- nom d'icône ou URL
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE
);

-- Workspaces (appartiennent à une app)
CREATE TABLE workspaces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id      INTEGER REFERENCES apps(id),
  name        TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Droits d'accès : user <-> app
CREATE TABLE user_app_access (
  user_id     INTEGER REFERENCES users(id),
  app_id      INTEGER REFERENCES apps(id),
  PRIMARY KEY (user_id, app_id)
);

-- Droits d'accès : user <-> workspace
CREATE TABLE user_workspace_access (
  user_id       INTEGER REFERENCES users(id),
  workspace_id  INTEGER REFERENCES workspaces(id),
  role          TEXT DEFAULT 'member',  -- 'owner' ou 'member'
  PRIMARY KEY (user_id, workspace_id)
);

-- Admin (table séparée)
CREATE TABLE admin (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  otp_secret    TEXT  -- pour génération OTP côté serveur
);
```

---

## 4. API backend (routes)

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Login user → retourne JWT |
| POST | `/api/auth/logout` | Invalide la session |
| POST | `/api/admin/login` | Login admin étape 1 (mdp) |
| POST | `/api/admin/verify-otp` | Login admin étape 2 (OTP) |

### Portail
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/me/apps` | Apps accessibles à l'utilisateur connecté |
| GET | `/api/me/apps/:slug/workspaces` | Workspaces accessibles dans une app |

### Admin
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/admin/users` | Liste des utilisateurs |
| POST | `/api/admin/users` | Créer un utilisateur |
| PUT | `/api/admin/users/:id` | Modifier un utilisateur |
| DELETE | `/api/admin/users/:id` | Supprimer un utilisateur |
| PUT | `/api/admin/users/:id/access` | Modifier les accès apps/workspaces |

---

## 5. Interface utilisateur

### Page de login
- Formulaire simple : email + mot de passe
- Message d'erreur générique (ne pas préciser si c'est l'email ou le mdp qui est faux)
- Lien "mot de passe oublié"
- Design responsive, centré, épuré

### Portail principal (après login)
- Grille de tuiles/cartes responsive
- Chaque carte : icône + nom de l'app
- Comportement au clic selon le nombre de workspaces accessibles :
  - **1 seul workspace** → accès direct à l'app dans ce workspace (1 clic)
  - **Plusieurs workspaces** → la tuile affiche les workspaces disponibles (expand ou sous-menu), l'utilisateur choisit puis accède à l'app
- Header minimal : nom de l'utilisateur + bouton déconnexion

### Interface admin
- Accessible sur `/admin`
- Liste des utilisateurs avec statut (actif/inactif)
- Formulaire de création/édition utilisateur
- Gestion des accès : checkboxes apps + workspaces par utilisateur

---

## 6. Internationalisation (i18n)

- Langue par défaut : **français**
- Architecture prête pour le multilingue : tous les textes dans des fichiers de traduction (`/locales/fr.json`, `/locales/en.json`)
- Bibliothèque recommandée : `i18next` + `react-i18next`
- Pas d'interface de changement de langue dans la V1, mais la structure est en place

---

## 7. Sécurité

- Mots de passe hashés avec `bcrypt` (coût ≥ 12)
- JWT signé avec secret en variable d'environnement
- OTP admin : code à 6 chiffres, validité 10 minutes, usage unique
- Routes admin protégées par middleware vérifiant le token admin
- Rate limiting sur les routes de login (protection brute force)
- Variables sensibles dans `.env` (jamais committé sur GitHub)

---

## 8. Structure des fichiers (dans le monorepo)

```
apps/hub/
├── src/
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Portal.jsx
│   │   └── admin/
│   │       ├── AdminLogin.jsx
│   │       ├── AdminDashboard.jsx
│   │       └── UserEditor.jsx
│   ├── components/
│   │   ├── AppCard.jsx
│   │   └── WorkspaceSelector.jsx
│   ├── locales/
│   │   ├── fr.json
│   │   └── en.json
│   └── main.jsx
├── index.html
└── vite.config.js

server/
├── routes/
│   ├── auth.js
│   ├── portal.js
│   └── admin.js
├── middleware/
│   ├── authMiddleware.js
│   └── adminMiddleware.js
├── db/
│   ├── schema.sql
│   └── db.js
└── index.js
```

---

## 9. Création et gestion des workspaces

Les workspaces sont créés par les utilisateurs **au sein de chaque application** (pas depuis le portail).

Flux :
1. L'utilisateur crée un workspace depuis l'interface de l'app (ex. "Mon jardin 2024" dans JOURDOC)
2. Il en devient automatiquement `owner` et y a accès immédiatement
3. Pour partager ce workspace avec d'autres utilisateurs, **l'admin assigne les accès** depuis le panneau d'administration du portail
4. L'utilisateur partagé voit alors le workspace apparaître dans sa tuile sur le portail

Ce modèle centralise le contrôle des accès chez l'admin, cohérent avec le choix d'une gestion fermée (pas d'inscription libre).

---

## 10. Ce qui n'est PAS dans la V1

- Inscription libre des utilisateurs
- OTP pour les utilisateurs classiques
- Notifications push
- Historique des connexions
- Changement de langue dans l'interface

Ces points peuvent être ajoutés ultérieurement sans refonte de l'architecture.
