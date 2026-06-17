# Authentification

## Utilisateurs

**Endpoint :** `POST /api/auth/login`  
**Body :** `{ identifier, password }` — `identifier` accepte email ou username.  
**Réponse :** `{ token }` (JWT 7 j).

Le token est stocké dans `localStorage` et injecté dans chaque requête via le header `Authorization: Bearer <token>`. `authMiddleware` le vérifie et place `userId` dans le contexte Hono.

Côté frontend, `AuthContext` (`apps/hub/src/context/AuthContext.jsx`) expose `login()` / `logout()` et `token`. Le composant `<PrivateRoute>` redirige vers `/login` si `token` est absent.

## Admin (2 étapes + OTP)

### Étape 1 — mot de passe
`POST /api/admin/login` avec `{ email, password }`.  
Si valide, génère un OTP à 6 chiffres (valable 10 min), l'enregistre en base (`admin.otp_code`, `admin.otp_expires`) et l'envoie par email SMTP.  
En développement, si l'envoi échoue, l'OTP est affiché dans le terminal.

### Étape 2 — OTP
`POST /api/admin/verify-otp` avec `{ email, otp }`.  
Si l'OTP est valide et non expiré, le champ est effacé en base et un JWT admin (4 h, `role: 'admin'`) est retourné.

Le token admin est stocké dans `sessionStorage` (disparaît à la fermeture de l'onglet). `<AdminRoute>` dans `main.jsx` redirige vers `/admin/login` si absent.

## Modification des identifiants admin

Requiert une confirmation OTP supplémentaire :

1. `POST /api/admin/settings/request-otp` — envoie un nouvel OTP à l'email admin actuel.
2. `POST /api/admin/settings/confirm` — valide l'OTP et applique `newEmail` et/ou `newPassword`.

## Rate limiting

Limité à 20 requêtes par IP sur 15 minutes (Map en mémoire, remise à zéro au redémarrage), appliqué aux routes : `/api/auth/*`, `/api/admin/login`, `/api/admin/verify-otp`.
