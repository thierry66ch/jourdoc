// server/lib/clipper/readability.js — extraction de l'article via Readability + jsdom.
//
// ⚠️ SERVER-ONLY : jsdom ne doit JAMAIS être importé côté client (bundle clipper).
// Imports dynamiques pour ne pas alourdir l'init serverless quand la route n'est pas
// appelée.

/**
 * @param {string} html  HTML rendu de la page (envoyé par le bookmarklet)
 * @param {string} url   URL source (base pour la résolution des liens)
 * @returns {Promise<null | {title, excerpt, content, byline, siteName, textContent}>}
 */
export async function extractArticle(html, url) {
  const { JSDOM } = await import('jsdom')
  const { Readability } = await import('@mozilla/readability')

  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()
  if (!article) return null

  return {
    title: article.title || '',
    excerpt: article.excerpt || '',
    content: article.content || '',        // HTML nettoyé → converti en Markdown
    byline: article.byline || null,
    siteName: article.siteName || null,
    textContent: article.textContent || '',
  }
}
