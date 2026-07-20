// Intercepteur 401 global.
//
// Problème : le token JWT (7 j) expire mais reste stocké en localStorage. `PrivateRoute`
// le voit toujours présent et rend l'app, alors que toutes les requêtes API renvoient
// 401 → workspaces/notes vides → état indéterminé bloqué, sans issue.
//
// Solution : envelopper `window.fetch`. Sur un 401 provenant de notre API (hors endpoints
// d'authentification), si on se croyait connecté (token présent), on purge le token et on
// redirige vers /login en mémorisant la page courante (?next=) pour y revenir ensuite.
//
// Approche par wrapper global (plutôt qu'un client centralisé) : couvre d'un coup tous les
// `fetch` bruts dispersés dans l'app sans les réécrire un par un.

// Endpoints qui renvoient légitimement 401 sans que la session soit « expirée »
// (mauvais identifiants au login, etc.) → ne pas rediriger.
const AUTH_EXEMPT = [/\/api\/auth\//, /\/api\/admin\/login/]

let redirecting = false

export function installAuthInterceptor() {
  if (typeof window === 'undefined' || window.__jdAuthInterceptor) return
  window.__jdAuthInterceptor = true

  const origFetch = window.fetch.bind(window)

  window.fetch = async (input, init) => {
    const res = await origFetch(input, init)
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      const isApi = url.includes('/api/')
      const exempt = AUTH_EXEMPT.some(re => re.test(url))
      if (res.status === 401 && isApi && !exempt && !redirecting) {
        // On ne redirige que si on pensait être authentifié (token utilisateur présent).
        // Les sessions admin (sessionStorage) sont gérées séparément par leurs routes.
        if (localStorage.getItem('token')) {
          redirecting = true
          localStorage.removeItem('token')
          if (!window.location.pathname.startsWith('/login')) {
            const here = window.location.pathname + window.location.search
            window.location.assign(`/login?next=${encodeURIComponent(here)}`)
          }
        }
      }
    } catch {
      /* ne jamais casser le fetch d'origine à cause de l'intercepteur */
    }
    return res
  }
}
