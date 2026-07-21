# Authentification — JourDoc V2

JWT HS256 (`jsonwebtoken`), deux niveaux : **user** et **admin**.

## Utilisateurs

**Login :** `POST /api/auth/login` — body `{ identifier, password }`
(`identifier` = email ou username) → `{ token }` (JWT, durée `JWT_EXPIRES_IN`, ex. 7 j).
**Logout :** `POST /api/auth/logout` — stateless, le client supprime le token.

Le token est stocké en `localStorage` et envoyé via `Authorization: Bearer <token>`.
`authMiddleware` le vérifie et pose `c.set('userId', payload.sub)`.

Côté front, `AuthContext` (`src/context/AuthContext.jsx`) expose `login()` /
`logout()` / `token`. `<PrivateRoute>` redirige vers `/login` si le token est absent.

### Intercepteur 401 global (session expirée)

Le JWT expire (7 j) mais reste en `localStorage` → `<PrivateRoute>` le voit encore
présent et rend l'app, alors que toute l'API renvoie 401 → workspaces/notes vides,
état bloqué. `src/lib/authInterceptor.js` (installé dans `main.jsx`) **enveloppe
`window.fetch`** : sur un 401 d'une route `/api/` (hors endpoints d'auth), si un token
utilisateur est présent, il le purge et redirige vers `/login?next=<page>`. `Login`
honore `?next=` pour revenir où l'utilisateur était. Approche par wrapper global →
couvre d'un coup tous les `fetch` bruts sans les réécrire.

### Token en query `?t=` (médias)

`<img src>` et `<iframe src>` ne peuvent pas envoyer de header `Authorization`.
`authMiddleware` accepte donc **aussi** le token en query :

```js
const token = header.replace('Bearer ', '') || c.req.query('t') || ''
```

Toujours construire les URLs media avec `mediaUrl(wsId, id, token)` (`hooks.js`),
qui ajoute `?t=<token>`.

## Mot de passe oublié / réinitialisation

1. `POST /api/auth/forgot-password` — body `{ email }`. Génère un `reset_token`
   (stocké avec `reset_expires` sur `users`) et envoie un email avec un lien
   `/reset-password?token=…`. Réponse neutre (ne révèle pas si l'email existe).
2. `POST /api/auth/reset-password` — body `{ token, password }`. Vérifie le token
   et son expiration, met à jour `password_hash`, efface le token.

Front : pages `ForgotPassword.jsx` et `ResetPassword.jsx`.

## Admin (2 étapes + OTP)

1. `POST /api/admin/login` — `{ email, password }`. Si valide, génère un OTP
   6 chiffres (10 min), le stocke (`admin.otp_code` / `otp_expires`) et l'envoie
   par email SMTP. En dev, si l'envoi échoue, l'OTP est affiché en console.
2. `POST /api/admin/verify-otp` — `{ email, otp }`. Si valide et non expiré,
   efface l'OTP et retourne un JWT admin (`role: 'admin'`).

Le token admin est stocké en `sessionStorage` (disparaît à la fermeture de l'onglet).
`adminMiddleware` vérifie le rôle `admin`. `<AdminRoute>` redirige vers `/admin/login`.

### Modification des identifiants admin
`POST /api/admin/settings/request-otp` (envoie un OTP à l'email actuel) puis
`POST /api/admin/settings/confirm` (valide l'OTP, applique `newEmail` / `newPassword`).
Le middleware admin couvre `admin.use('/settings/*', adminMiddleware)`
(wildcard Hono v4 : `'/settings/*'`, pas `'/settings*'`).

## Configuration

Variables : `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_EMAIL`, `SMTP_HOST/PORT/USER/PASS`.
