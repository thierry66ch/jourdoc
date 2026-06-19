// Construit une table des matières à partir d'un HTML : assigne un id à chaque
// titre (h1–h3) et renvoie le HTML enrichi + la liste { level, text, id }.
function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9À-ſ]+/g, '-') // garde lettres accentuées
    .replace(/^-+|-+$/g, '')
}

export function buildToc(html) {
  if (typeof window === 'undefined' || !html) return { html, items: [] }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const heads = [...doc.querySelectorAll('h1, h2, h3')]
  const items = []
  const seen = {}
  heads.forEach((h, i) => {
    const text = h.textContent.trim()
    if (!text) return
    let id = slugify(text) || `h-${i}`
    if (seen[id]) id = `${id}-${seen[id]++}`; else seen[id] = 1
    h.id = id
    items.push({ level: Number(h.tagName[1]), text, id })
  })
  return { html: doc.body.innerHTML, items }
}
