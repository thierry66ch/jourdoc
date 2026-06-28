// server/lib/clipper/readability.js — extraction de l'article via Readability.
//
// DOM = linkedom (et NON jsdom) : jsdom tire une chaîne de dépendances ESM
// (html-encoding-sniffer → @exodus/bytes) que le runtime CJS de Vercel ne peut pas
// charger (`require() of ES Module not supported`). linkedom est léger, serverless-
// friendly et compatible @mozilla/readability.
//
// ⚠️ SERVER-ONLY : ne jamais importer côté client. Imports dynamiques pour l'init.

// Résout les URLs relatives (href/src) en absolues contre l'URL source.
// linkedom ne renseigne pas baseURI → on le fait nous-mêmes plutôt que de compter
// sur le _fixRelativeUris de Readability. On passe par un élément conteneur
// (innerHTML) car parseHTML('<body>…</body>') ne reparente pas correctement le
// fragment dans linkedom (document.body ressort vide).
function absolutizeUrls(parseHTML, htmlStr, base) {
  if (!htmlStr) return htmlStr
  let div
  try {
    const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>')
    div = document.createElement('div')
    div.innerHTML = htmlStr
  } catch { return htmlStr }
  for (const attr of ['href', 'src']) {
    for (const el of div.querySelectorAll(`[${attr}]`)) {
      const v = el.getAttribute(attr)
      if (!v) continue
      try { el.setAttribute(attr, new URL(v, base).href) } catch { /* garde tel quel */ }
    }
  }
  return div.innerHTML
}

/**
 * Fallback : métadonnées de la page (OG, <meta>, JSON-LD) quand Readability n'extrait
 * pas d'article (SPA, pages liste…). Le HTML a été téléchargé, on récupère au moins
 * titre + description + image.
 * @returns {Promise<{title, description, image, siteName}>}
 */
export async function extractMeta(html, url) {
  const { parseHTML } = await import('linkedom')
  const { document } = parseHTML(html)
  const get = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || ''

  let title = get('meta[property="og:title"]') || get('meta[name="twitter:title"]')
    || (document.querySelector('title')?.textContent || '').trim()
  let description = get('meta[property="og:description"]') || get('meta[name="description"]')
    || get('meta[name="twitter:description"]')
  let image = get('meta[property="og:image"]') || get('meta[name="twitter:image"]')
  const siteName = get('meta[property="og:site_name"]')

  // JSON-LD : headline / description si manquants
  if (!title || !description) {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent)
        const arr = Array.isArray(j) ? j : (j['@graph'] || [j])
        const node = arr.find((x) => x && (x.headline || x.description)) || {}
        if (!title && node.headline) title = String(node.headline).trim()
        if (!description && node.description) description = String(node.description).trim()
        if (title && description) break
      } catch { /* JSON-LD invalide, on ignore */ }
    }
  }

  if (image) { try { image = new URL(image, url).href } catch { /* garde tel quel */ } }
  return { title, description, image, siteName }
}

/**
 * @param {string} html  HTML rendu de la page (envoyé par le bookmarklet)
 * @param {string} url   URL source (base pour la résolution des liens)
 * @returns {Promise<null | {title, excerpt, content, byline, siteName, textContent}>}
 */
export async function extractArticle(html, url) {
  const { parseHTML } = await import('linkedom')
  const { Readability } = await import('@mozilla/readability')

  const { document } = parseHTML(html)

  // Description : lue AVANT Readability (qui peut nettoyer le <head>).
  // og:description prioritaire, puis <meta name="description">.
  const metaDesc = (
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
    ''
  ).trim()

  const article = new Readability(document).parse()
  if (!article) return null

  return {
    title: article.title || '',
    excerpt: article.excerpt || '',
    description: metaDesc || article.excerpt || '',
    content: absolutizeUrls(parseHTML, article.content || '', url),
    byline: article.byline || null,
    siteName: article.siteName || null,
    textContent: article.textContent || '',
  }
}
