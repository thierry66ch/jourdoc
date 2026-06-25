// server/lib/clipper/turndown.js — HTML nettoyé → Markdown.
//
// turndown (+ plugin GFM pour tables, strikethrough, task lists) sont déjà des
// dépendances du projet. turndown tourne en Node via son DOM embarqué (domino),
// pas besoin de jsdom ici. Import dynamique pour l'init serverless.

export async function htmlToMarkdown(html) {
  const TurndownService = (await import('turndown')).default
  const { gfm } = await import('turndown-plugin-gfm')

  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    linkStyle: 'inlined',
  })
  td.use(gfm)

  return td.turndown(html || '').trim()
}
