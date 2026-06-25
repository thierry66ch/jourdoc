// server/lib/clipper/slug.js — slugification pour noms de fichiers / dossiers KDrive.

// Translittère, lowercase, remplace tout non-alphanumérique par '-', tronque.
export function slugify(str, max = 80) {
  const s = String(str || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // retire les diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (s.slice(0, max).replace(/-+$/g, '')) || 'page'
}

// Slug du domaine source (sans www.), pour le sous-dossier clipper/{domaine}/.
export function domainSlug(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    return slugify(h, 60)
  } catch {
    return 'web'
  }
}
