import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import sql from '../../db/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'
import { uploadFile, downloadFile, deleteFile, listFiles, listDir, getTextFile, putTextFile } from '../../packages/storage/index.js'

const jourdoc = new Hono()

jourdoc.use('*', authMiddleware)

// Vérifie que l'utilisateur a accès au workspace
async function wsCheck(c, next) {
  const userId = c.get('userId')
  const wsId = Number(c.req.param('wsId'))
  if (!wsId) return c.json({ error: 'Invalid workspace' }, 400)
  const [ok] = await sql`
    SELECT 1 FROM user_workspace_access WHERE user_id = ${userId} AND workspace_id = ${wsId}
  `
  if (!ok) return c.json({ error: 'Forbidden' }, 403)
  c.set('wsId', wsId)
  return next()
}

// ── IMPORT CSV ───────────────────────────────────────────────

function parseCSV(raw) {
  let text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') ? ';' : ','
  const split = line => line.split(sep).map(c => c.trim().replace(/^["'](.*)["']$/, '$1'))
  const headers = split(lines[0]).map(h => h.toLowerCase())
  const rows = lines.slice(1)
    .map(line => Object.fromEntries(headers.map((h, i) => [h, split(line)[i] ?? ''])))
    .filter(r => Object.values(r).some(v => v.trim()))
  return { headers, rows }
}

function boolVal(s) {
  return ['1','true','oui','yes','x'].includes((s ?? '').toLowerCase().trim())
}

function topoSort(rows, nameKey, parentKey) {
  const processed = new Set([''])
  const result = []
  let remaining = [...rows]
  while (remaining.length > 0) {
    const before = remaining.length
    const next = []
    for (const row of remaining) {
      const parent = (row[parentKey] ?? '').trim()
      if (processed.has(parent)) {
        result.push(row)
        processed.add((row[nameKey] ?? '').trim())
      } else {
        next.push(row)
      }
    }
    remaining = next
    if (remaining.length === before) { result.push(...remaining); break }
  }
  return result
}

async function upsertObjet(wsId, nom, parentId, nomCourt, estIndividu, description, created, updated, skipped) {
  let exact
  if (parentId === null) {
    ;[exact] = await sql`SELECT id FROM jd_objets WHERE workspace_id=${wsId} AND nom=${nom} AND parent_id IS NULL`
  } else {
    ;[exact] = await sql`SELECT id FROM jd_objets WHERE workspace_id=${wsId} AND nom=${nom} AND parent_id=${parentId}`
  }
  if (exact) { skipped.push(nom); return exact.id }

  const [byName] = await sql`SELECT id FROM jd_objets WHERE workspace_id=${wsId} AND nom=${nom}`
  if (byName) {
    await sql`UPDATE jd_objets SET parent_id=${parentId} WHERE id=${byName.id}`
    updated.push(nom); return byName.id
  }

  const [r] = await sql`
    INSERT INTO jd_objets (workspace_id, parent_id, nom, nom_court, est_individu, description)
    VALUES (${wsId}, ${parentId}, ${nom}, ${nomCourt || null}, ${estIndividu}, ${description || null})
    RETURNING id
  `
  created.push(nom); return r.id
}

async function upsertTheme(wsId, nom, parentId, nomCourt, created, updated, skipped) {
  let exact
  if (parentId === null) {
    ;[exact] = await sql`SELECT id FROM jd_themes WHERE workspace_id=${wsId} AND nom=${nom} AND parent_id IS NULL`
  } else {
    ;[exact] = await sql`SELECT id FROM jd_themes WHERE workspace_id=${wsId} AND nom=${nom} AND parent_id=${parentId}`
  }
  if (exact) { skipped.push(nom); return exact.id }

  const [byName] = await sql`SELECT id FROM jd_themes WHERE workspace_id=${wsId} AND nom=${nom}`
  if (byName) {
    await sql`UPDATE jd_themes SET parent_id=${parentId} WHERE id=${byName.id}`
    updated.push(nom); return byName.id
  }

  const [r] = await sql`
    INSERT INTO jd_themes (workspace_id, parent_id, nom, nom_court)
    VALUES (${wsId}, ${parentId}, ${nom}, ${nomCourt || null})
    RETURNING id
  `
  created.push(nom); return r.id
}

jourdoc.post('/:wsId/import/objets', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { csv } = await c.req.json()
  if (!csv?.trim()) return c.json({ error: 'CSV vide' }, 400)

  const { headers, rows } = parseCSV(csv)
  const created = [], updated = [], skipped = [], errors = []
  const pathCache = new Map()
  const nameCache = new Map()
  const hasPath = headers.includes('chemin') || headers.includes('path')

  if (hasPath) {
    for (const row of rows) {
      const chemin = (row.chemin || row.path || '').trim()
      if (!chemin) continue
      const parts = chemin.split('/').map(p => p.trim()).filter(Boolean)
      let parentId = null, cumPath = ''
      for (let i = 0; i < parts.length; i++) {
        const nom = parts[i]
        cumPath = cumPath ? `${cumPath}/${nom}` : nom
        if (pathCache.has(cumPath)) { parentId = pathCache.get(cumPath); continue }
        const isLeaf = i === parts.length - 1
        const id = await upsertObjet(wsId, nom, parentId,
          isLeaf ? row.nom_court : null,
          isLeaf && boolVal(row.est_individu),
          isLeaf ? row.description : null,
          created, updated, skipped)
        pathCache.set(cumPath, id)
        parentId = id
      }
    }
  } else {
    const sorted = topoSort(rows, 'nom', 'parent')
    const existing = await sql`SELECT id, nom FROM jd_objets WHERE workspace_id=${wsId}`
    for (const o of existing) nameCache.set(o.nom, o.id)
    for (const row of sorted) {
      const nom = (row.nom || row.name || '').trim()
      if (!nom) continue
      const parentNom = (row.parent || '').trim()
      const parentId = parentNom ? (nameCache.get(parentNom) ?? null) : null
      const id = await upsertObjet(wsId, nom, parentId, row.nom_court, boolVal(row.est_individu), row.description, created, updated, skipped)
      nameCache.set(nom, id)
    }
  }

  return c.json({ created: created.length, updated: updated.length, skipped: skipped.length, errors })
})

jourdoc.post('/:wsId/import/themes', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { csv } = await c.req.json()
  if (!csv?.trim()) return c.json({ error: 'CSV vide' }, 400)

  const { headers, rows } = parseCSV(csv)
  const created = [], updated = [], skipped = [], errors = []
  const pathCache = new Map()
  const nameCache = new Map()
  const hasPath = headers.includes('chemin') || headers.includes('path')

  if (hasPath) {
    for (const row of rows) {
      const chemin = (row.chemin || row.path || '').trim()
      if (!chemin) continue
      const parts = chemin.split('/').map(p => p.trim()).filter(Boolean)
      let parentId = null, cumPath = ''
      for (let i = 0; i < parts.length; i++) {
        const nom = parts[i]
        cumPath = cumPath ? `${cumPath}/${nom}` : nom
        if (pathCache.has(cumPath)) { parentId = pathCache.get(cumPath); continue }
        const isLeaf = i === parts.length - 1
        const id = await upsertTheme(wsId, nom, parentId, isLeaf ? row.nom_court : null, created, updated, skipped)
        pathCache.set(cumPath, id)
        parentId = id
      }
    }
  } else {
    const sorted = topoSort(rows, 'nom', 'parent')
    const existing = await sql`SELECT id, nom FROM jd_themes WHERE workspace_id=${wsId}`
    for (const t of existing) nameCache.set(t.nom, t.id)
    for (const row of sorted) {
      const nom = (row.nom || row.name || '').trim()
      if (!nom) continue
      const parentNom = (row.parent || '').trim()
      const parentId = parentNom ? (nameCache.get(parentNom) ?? null) : null
      const id = await upsertTheme(wsId, nom, parentId, row.nom_court, created, updated, skipped)
      nameCache.set(nom, id)
    }
  }

  return c.json({ created: created.length, updated: updated.length, skipped: skipped.length, errors })
})

// ── WORKSPACES ───────────────────────────────────────────────

async function ownerCheck(c, next) {
  const userId = c.get('userId')
  const wsId = c.get('wsId') ?? Number(c.req.param('wsId'))
  const [access] = await sql`
    SELECT role FROM user_workspace_access WHERE user_id=${userId} AND workspace_id=${wsId}
  `
  if (access?.role !== 'owner') return c.json({ error: 'Owner requis' }, 403)
  return next()
}

jourdoc.get('/workspaces', async (c) => {
  const userId = c.get('userId')
  const ws = await sql`
    SELECT w.id, w.name, uwa.role, w.created_at
    FROM workspaces w
    JOIN user_workspace_access uwa ON uwa.workspace_id = w.id
    JOIN apps a ON a.id = w.app_id
    WHERE uwa.user_id = ${userId} AND a.slug = 'jourdoc'
    ORDER BY w.name
  `
  return c.json({ workspaces: ws })
})

jourdoc.post('/workspaces', async (c) => {
  const userId = c.get('userId')
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Nom requis' }, 400)
  const [app] = await sql`SELECT id FROM apps WHERE slug = 'jourdoc'`
  if (!app) return c.json({ error: 'App jourdoc introuvable' }, 404)
  const [ws] = await sql`
    INSERT INTO workspaces (app_id, name, created_by) VALUES (${app.id}, ${name.trim()}, ${userId}) RETURNING id
  `
  await sql`
    INSERT INTO user_workspace_access (user_id, workspace_id, role) VALUES (${userId}, ${ws.id}, 'owner')
  `
  await sql`
    INSERT INTO user_app_access (user_id, app_id) VALUES (${userId}, ${app.id}) ON CONFLICT DO NOTHING
  `
  await seedDocCategories(ws.id)
  await seedDocStatuts(ws.id)
  return c.json({ id: ws.id, name: name.trim() }, 201)
})

// Catégories de documentation par défaut (nouveau workspace)
async function seedDocCategories(wsId) {
  await sql`INSERT INTO jd_doc_categorie (workspace_id, nom, icon, couleur, ordre)
    SELECT ${wsId}, d.nom, d.icon, d.couleur, d.ordre FROM (VALUES
      ('Conseil','💡','#f59e0b',1),('Descriptif','📋','#0ea5e9',2),
      ('Manuel','📖','#8b5cf6',3),('Norme','📐','#ef4444',4),('Exemple','✨','#10b981',5)
    ) AS d(nom,icon,couleur,ordre) ON CONFLICT (workspace_id, nom) DO NOTHING`
}

// Statuts de documentation par défaut (nouveau workspace)
async function seedDocStatuts(wsId) {
  await sql`INSERT INTO jd_doc_statut (workspace_id, nom, icon, couleur, ordre)
    SELECT ${wsId}, d.nom, d.icon, d.couleur, d.ordre FROM (VALUES
      ('Brouillon','✏️','#94a3b8',1),('Validé','✅','#10b981',2),('Obsolète','⚠️','#ef4444',3)
    ) AS d(nom,icon,couleur,ordre) ON CONFLICT (workspace_id, nom) DO NOTHING`
}

jourdoc.use('/:wsId/*', wsCheck)

// ── Helpers ──────────────────────────────────────────────────

async function refreshLie(mediaId) {
  const [r] = await sql`SELECT COUNT(*) AS n FROM jd_note_media WHERE media_id = ${mediaId}`
  await sql`UPDATE jd_medias SET lie = ${Number(r.n) > 0} WHERE id = ${mediaId}`
}

// PostgreSQL DATE/TIMESTAMPTZ → string 'YYYY-MM-DD' (attendu par le frontend V1)
function fmtDate(v) {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return null
}

function normalizeNote(note) {
  return { ...note, date: fmtDate(note.date) }
}

// Référentiels de documentation (catégorie / statut) pour affichage du badge
async function docCategorie(id) {
  if (!id) return null
  const [cat] = await sql`SELECT id, nom, icon, couleur FROM jd_doc_categorie WHERE id = ${id}`
  return cat ?? null
}
async function docStatutRef(id) {
  if (!id) return null
  const [s] = await sql`SELECT id, nom, icon, couleur FROM jd_doc_statut WHERE id = ${id}`
  return s ?? null
}

async function withData(notes) {
  return Promise.all(notes.map(async note => {
    const [objets, themes, medias, elements] = await Promise.all([
      sql`SELECT o.id, o.nom, o.nom_court FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ${note.id}`,
      sql`SELECT t.id, t.nom, t.nom_court FROM jd_note_theme nt JOIN jd_themes t ON t.id = nt.theme_id WHERE nt.note_id = ${note.id} ORDER BY t.nom`,
      sql`SELECT m.id, m.type_media, m.nom_original, m.fichier FROM jd_note_media nm JOIN jd_medias m ON m.id = nm.media_id WHERE nm.note_id = ${note.id} ORDER BY m.created_at LIMIT 6`,
      sql`SELECT e.id, e.nom FROM jd_note_element ne JOIN jd_elements e ON e.id = ne.element_id WHERE ne.note_id = ${note.id} ORDER BY e.nom`,
    ])
    const doc_categorie = await docCategorie(note.doc_categorie_id)
    const doc_statut = await docStatutRef(note.doc_statut_id)
    return { ...normalizeNote(note), objets, themes, medias, elements, doc_categorie, doc_statut }
  }))
}

// ── ÉLÉMENTS ─────────────────────────────────────────────────

jourdoc.get('/:wsId/elements', async (c) => {
  const wsId = c.get('wsId')
  const elements = await sql`
    SELECT e.id, e.nom, e.created_at,
      (SELECT COUNT(*) FROM jd_note_element ne WHERE ne.element_id = e.id) AS note_count
    FROM jd_elements e WHERE e.workspace_id = ${wsId} ORDER BY e.nom
  `
  return c.json({ elements })
})

jourdoc.post('/:wsId/elements', async (c) => {
  const wsId = c.get('wsId')
  const { nom } = await c.req.json()
  if (!nom?.trim()) return c.json({ error: 'Nom requis' }, 400)
  const [existing] = await sql`SELECT id FROM jd_elements WHERE workspace_id=${wsId} AND nom=${nom.trim()}`
  if (existing) return c.json({ id: existing.id, existing: true })
  const [r] = await sql`INSERT INTO jd_elements (workspace_id, nom) VALUES (${wsId}, ${nom.trim()}) RETURNING id`
  return c.json({ id: r.id }, 201)
})

jourdoc.put('/:wsId/elements/:id', async (c) => {
  const wsId = c.get('wsId'); const id = Number(c.req.param('id'))
  const { nom } = await c.req.json()
  if (!nom?.trim()) return c.json({ error: 'Nom requis' }, 400)
  await sql`UPDATE jd_elements SET nom=${nom.trim()} WHERE id=${id} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/elements/:id', async (c) => {
  const wsId = c.get('wsId'); const id = Number(c.req.param('id'))
  const [r] = await sql`SELECT COUNT(*) AS n FROM jd_note_element WHERE element_id=${id}`
  const count = Number(r?.n ?? 0)
  if (count > 0) return c.json({ error: `Cet élément est lié à ${count} note${count>1?'s':''} — supprimez les liens d'abord` }, 409)
  await sql`DELETE FROM jd_elements WHERE id=${id} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

jourdoc.post('/:wsId/elements/merge', async (c) => {
  const wsId = c.get('wsId')
  const { source_ids = [], target_nom } = await c.req.json()
  if (!target_nom?.trim() || source_ids.length === 0) return c.json({ error: 'source_ids et target_nom requis' }, 400)
  let targetId
  const [existing] = await sql`SELECT id FROM jd_elements WHERE workspace_id=${wsId} AND nom=${target_nom.trim()}`
  if (existing) { targetId = existing.id }
  else { const [r] = await sql`INSERT INTO jd_elements (workspace_id, nom) VALUES (${wsId}, ${target_nom.trim()}) RETURNING id`; targetId = r.id }
  for (const srcId of source_ids) {
    if (srcId === targetId) continue
    const notes = await sql`SELECT note_id FROM jd_note_element WHERE element_id=${srcId}`
    for (const { note_id } of notes)
      await sql`INSERT INTO jd_note_element (note_id, element_id) VALUES (${note_id}, ${targetId}) ON CONFLICT DO NOTHING`
    await sql`DELETE FROM jd_note_element WHERE element_id=${srcId}`
    await sql`DELETE FROM jd_elements WHERE id=${srcId} AND workspace_id=${wsId}`
  }
  return c.json({ ok: true, target_id: targetId })
})

// ── CATÉGORIES DE DOCUMENTATION ──────────────────────────────

jourdoc.get('/:wsId/doc-categories', async (c) => {
  const wsId = c.get('wsId')
  const categories = await sql`
    SELECT dc.id, dc.nom, dc.icon, dc.couleur, dc.ordre,
      (SELECT COUNT(*) FROM jd_notes n WHERE n.doc_categorie_id = dc.id) AS note_count
    FROM jd_doc_categorie dc WHERE dc.workspace_id = ${wsId}
    ORDER BY dc.ordre, dc.nom
  `
  return c.json({ categories })
})

jourdoc.post('/:wsId/doc-categories', async (c) => {
  const wsId = c.get('wsId')
  const { nom, icon, couleur } = await c.req.json()
  if (!nom?.trim()) return c.json({ error: 'Nom requis' }, 400)
  const [existing] = await sql`SELECT id FROM jd_doc_categorie WHERE workspace_id=${wsId} AND nom=${nom.trim()}`
  if (existing) return c.json({ id: existing.id, existing: true })
  const [{ max }] = await sql`SELECT COALESCE(MAX(ordre),0) AS max FROM jd_doc_categorie WHERE workspace_id=${wsId}`
  const [r] = await sql`
    INSERT INTO jd_doc_categorie (workspace_id, nom, icon, couleur, ordre)
    VALUES (${wsId}, ${nom.trim()}, ${icon ?? null}, ${couleur ?? null}, ${Number(max) + 1})
    RETURNING id
  `
  return c.json({ id: r.id }, 201)
})

jourdoc.put('/:wsId/doc-categories/:id', async (c) => {
  const wsId = c.get('wsId'); const id = Number(c.req.param('id'))
  const { nom, icon, couleur, ordre } = await c.req.json()
  if (!nom?.trim()) return c.json({ error: 'Nom requis' }, 400)
  await sql`
    UPDATE jd_doc_categorie
    SET nom=${nom.trim()}, icon=${icon ?? null}, couleur=${couleur ?? null}, ordre=${ordre ?? 0}
    WHERE id=${id} AND workspace_id=${wsId}
  `
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/doc-categories/:id', async (c) => {
  const wsId = c.get('wsId'); const id = Number(c.req.param('id'))
  // FK ON DELETE SET NULL : les notes concernées deviennent « sans catégorie »
  await sql`DELETE FROM jd_doc_categorie WHERE id=${id} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

// ── STATUTS DE DOCUMENTATION ─────────────────────────────────

jourdoc.get('/:wsId/doc-statuts', async (c) => {
  const wsId = c.get('wsId')
  const statuts = await sql`
    SELECT ds.id, ds.nom, ds.icon, ds.couleur, ds.ordre,
      (SELECT COUNT(*) FROM jd_notes n WHERE n.doc_statut_id = ds.id) AS note_count
    FROM jd_doc_statut ds WHERE ds.workspace_id = ${wsId}
    ORDER BY ds.ordre, ds.nom
  `
  return c.json({ statuts })
})

jourdoc.post('/:wsId/doc-statuts', async (c) => {
  const wsId = c.get('wsId')
  const { nom, icon, couleur } = await c.req.json()
  if (!nom?.trim()) return c.json({ error: 'Nom requis' }, 400)
  const [existing] = await sql`SELECT id FROM jd_doc_statut WHERE workspace_id=${wsId} AND nom=${nom.trim()}`
  if (existing) return c.json({ id: existing.id, existing: true })
  const [{ max }] = await sql`SELECT COALESCE(MAX(ordre),0) AS max FROM jd_doc_statut WHERE workspace_id=${wsId}`
  const [r] = await sql`
    INSERT INTO jd_doc_statut (workspace_id, nom, icon, couleur, ordre)
    VALUES (${wsId}, ${nom.trim()}, ${icon ?? null}, ${couleur ?? null}, ${Number(max) + 1})
    RETURNING id
  `
  return c.json({ id: r.id }, 201)
})

jourdoc.put('/:wsId/doc-statuts/:id', async (c) => {
  const wsId = c.get('wsId'); const id = Number(c.req.param('id'))
  const { nom, icon, couleur, ordre } = await c.req.json()
  if (!nom?.trim()) return c.json({ error: 'Nom requis' }, 400)
  await sql`
    UPDATE jd_doc_statut
    SET nom=${nom.trim()}, icon=${icon ?? null}, couleur=${couleur ?? null}, ordre=${ordre ?? 0}
    WHERE id=${id} AND workspace_id=${wsId}
  `
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/doc-statuts/:id', async (c) => {
  const wsId = c.get('wsId'); const id = Number(c.req.param('id'))
  await sql`DELETE FROM jd_doc_statut WHERE id=${id} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

// ── WORKSPACE info + settings ─────────────────────────────────

jourdoc.patch('/:wsId', wsCheck, ownerCheck, async (c) => {
  const wsId = c.get('wsId')
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Nom requis' }, 400)
  await sql`UPDATE workspaces SET name=${name.trim()} WHERE id=${wsId}`
  return c.json({ ok: true, name: name.trim() })
})

jourdoc.delete('/:wsId', wsCheck, ownerCheck, async (c) => {
  const wsId = c.get('wsId')
  await sql`DELETE FROM workspaces WHERE id=${wsId}`
  return c.json({ ok: true })
})

jourdoc.get('/:wsId/members', async (c) => {
  const wsId = c.get('wsId')
  const members = await sql`
    SELECT u.id, u.username, u.email, uwa.role
    FROM user_workspace_access uwa JOIN users u ON u.id = uwa.user_id
    WHERE uwa.workspace_id = ${wsId} ORDER BY uwa.role DESC, u.username
  `
  return c.json({ members })
})

jourdoc.post('/:wsId/members', ownerCheck, async (c) => {
  const wsId = c.get('wsId')
  const { identifier, role = 'member' } = await c.req.json()
  if (!identifier) return c.json({ error: 'identifier requis' }, 400)
  const [user] = await sql`SELECT id, username FROM users WHERE username=${identifier} OR email=${identifier}`
  if (!user) return c.json({ error: 'Utilisateur introuvable' }, 404)
  await sql`INSERT INTO user_workspace_access (user_id, workspace_id, role) VALUES (${user.id}, ${wsId}, ${role}) ON CONFLICT DO NOTHING`
  const [app] = await sql`SELECT id FROM apps WHERE slug='jourdoc'`
  if (app) await sql`INSERT INTO user_app_access (user_id, app_id) VALUES (${user.id}, ${app.id}) ON CONFLICT DO NOTHING`
  return c.json({ ok: true, user: { id: user.id, username: user.username } }, 201)
})

jourdoc.put('/:wsId/members/:uid', ownerCheck, async (c) => {
  const wsId = c.get('wsId')
  const uid = Number(c.req.param('uid'))
  const { role } = await c.req.json()
  if (!['owner','member'].includes(role)) return c.json({ error: 'Rôle invalide' }, 400)
  await sql`UPDATE user_workspace_access SET role=${role} WHERE user_id=${uid} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/members/:uid', async (c) => {
  const wsId = c.get('wsId')
  const userId = c.get('userId')
  const uid = Number(c.req.param('uid'))
  if (uid !== userId) {
    const [access] = await sql`SELECT role FROM user_workspace_access WHERE user_id=${userId} AND workspace_id=${wsId}`
    if (access?.role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  }
  await sql`DELETE FROM user_workspace_access WHERE user_id=${uid} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

jourdoc.get('/:wsId', async (c) => {
  const wsId = c.get('wsId')
  const [ws] = await sql`SELECT id, name,
      COALESCE(jd_search_depth, 3) AS search_depth,
      COALESCE(jd_picker_mode_mobile, 'filter')  AS picker_mode_mobile,
      COALESCE(jd_picker_mode_desktop, 'scroll') AS picker_mode_desktop
    FROM workspaces WHERE id = ${wsId}`
  return c.json({ workspace: ws })
})

jourdoc.patch('/:wsId/search-depth', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { depth } = await c.req.json()
  const d = Math.max(1, Math.min(10, Number(depth) || 3))
  await sql`UPDATE workspaces SET jd_search_depth=${d} WHERE id=${wsId}`
  return c.json({ ok: true, search_depth: d })
})

// Mode d'affichage des sélecteurs hiérarchiques (objets/thèmes).
// body: { platform: 'mobile'|'desktop', mode: 'filter'|'scroll' }
jourdoc.patch('/:wsId/picker-mode', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { platform, mode } = await c.req.json()
  const m = mode === 'filter' ? 'filter' : 'scroll'
  if (platform === 'mobile') {
    await sql`UPDATE workspaces SET jd_picker_mode_mobile=${m} WHERE id=${wsId}`
  } else if (platform === 'desktop') {
    await sql`UPDATE workspaces SET jd_picker_mode_desktop=${m} WHERE id=${wsId}`
  } else {
    return c.json({ error: 'Invalid platform' }, 400)
  }
  return c.json({ ok: true, platform, mode: m })
})

// ── OBJETS ───────────────────────────────────────────────────

jourdoc.get('/:wsId/objets', async (c) => {
  const wsId = c.get('wsId')
  const objets = await sql`
    SELECT id, parent_id, nom, nom_court, est_individu, description FROM jd_objets WHERE workspace_id = ${wsId} ORDER BY nom
  `
  return c.json({ objets })
})

jourdoc.post('/:wsId/objets', async (c) => {
  const wsId = c.get('wsId')
  const { parent_id, nom, nom_court, est_individu = false, description } = await c.req.json()
  if (!nom) return c.json({ error: 'nom requis' }, 400)
  const [r] = await sql`
    INSERT INTO jd_objets (workspace_id, parent_id, nom, nom_court, est_individu, description)
    VALUES (${wsId}, ${parent_id ?? null}, ${nom}, ${nom_court ?? null}, ${Boolean(est_individu)}, ${description ?? null})
    RETURNING id
  `
  return c.json({ id: r.id }, 201)
})

jourdoc.put('/:wsId/objets/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { parent_id, nom, nom_court, est_individu, description } = await c.req.json()
  await sql`
    UPDATE jd_objets SET parent_id=${parent_id ?? null}, nom=${nom}, nom_court=${nom_court ?? null},
      est_individu=${Boolean(est_individu)}, description=${description ?? null}
    WHERE id=${id} AND workspace_id=${wsId}
  `
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/objets/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  await sql`DELETE FROM jd_objets WHERE id=${id} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

jourdoc.get('/:wsId/objets/:id/notes', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const direction = c.req.query('direction') ?? 'both'
  const [wsConf] = await sql`SELECT COALESCE(jd_search_depth,3) AS d FROM workspaces WHERE id=${wsId}`
  const maxDepth = wsConf?.d ?? 3
  let ids = []

  if (direction === 'down' || direction === 'both') {
    const rows = await sql(`
      WITH RECURSIVE descendants(id, depth) AS (
        SELECT id, 0 FROM jd_objets WHERE id = $1 AND workspace_id = $2
        UNION ALL
        SELECT o.id, d.depth + 1 FROM jd_objets o
        JOIN descendants d ON o.parent_id = d.id WHERE d.depth < $3
      )
      SELECT id FROM descendants
    `, [id, wsId, maxDepth])
    ids.push(...rows.map(r => r.id))
  }

  if (direction === 'up' || direction === 'both') {
    const rows = await sql(`
      WITH RECURSIVE ancestors(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM jd_objets WHERE id = $1 AND workspace_id = $2
        UNION ALL
        SELECT o.id, o.parent_id, a.depth + 1 FROM jd_objets o
        JOIN ancestors a ON o.id = a.parent_id WHERE a.depth < $3
      )
      SELECT id FROM ancestors
    `, [id, wsId, maxDepth])
    ids.push(...rows.map(r => r.id))
  }

  ids = [...new Set(ids)]
  if (ids.length === 0) return c.json({ notes: [] })

  const notes = await sql`
    SELECT DISTINCT n.*, t.nom AS theme_nom
    FROM jd_notes n
    JOIN jd_note_objet no ON no.note_id = n.id
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE no.objet_id = ANY(${ids}) AND n.workspace_id = ${wsId}
    ORDER BY n.date DESC, n.created_at DESC
  `
  return c.json({ notes: await withData(notes) })
})

// ── THEMES ───────────────────────────────────────────────────

jourdoc.get('/:wsId/themes/:id/notes', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const direction = c.req.query('direction') ?? 'both'

  const [wsConf] = await sql`SELECT COALESCE(jd_search_depth,3) AS d FROM workspaces WHERE id=${wsId}`
  const maxDepth = wsConf?.d ?? 3
  const allThemes = await sql`SELECT id, parent_id FROM jd_themes WHERE workspace_id = ${wsId}`
  const ids = new Set([id])

  if (direction === 'down' || direction === 'both') {
    const depthMap = new Map([[id, 0]]); let added = true
    while (added) {
      added = false
      for (const t of allThemes) {
        if (!ids.has(t.id) && ids.has(t.parent_id)) {
          const pd = depthMap.get(t.parent_id) ?? 0
          if (pd < maxDepth) { ids.add(t.id); depthMap.set(t.id, pd + 1); added = true }
        }
      }
    }
  }

  if (direction === 'up' || direction === 'both') {
    let current = id; let d = 0
    while (d < maxDepth) {
      const t = allThemes.find(x => x.id === current)
      if (!t || !t.parent_id) break
      ids.add(t.parent_id); current = t.parent_id; d++
    }
  }

  const idsArr = [...ids]
  const notes = await sql`
    SELECT DISTINCT n.*, t.nom AS theme_nom
    FROM jd_notes n
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE EXISTS (SELECT 1 FROM jd_note_theme nt WHERE nt.note_id = n.id AND nt.theme_id = ANY(${idsArr}))
      AND n.workspace_id = ${wsId}
    ORDER BY n.date DESC, n.created_at DESC
  `
  return c.json({ notes: await withData(notes) })
})

jourdoc.get('/:wsId/themes', async (c) => {
  const wsId = c.get('wsId')
  const themes = await sql`
    SELECT id, parent_id, nom, nom_court FROM jd_themes WHERE workspace_id = ${wsId} ORDER BY nom
  `
  return c.json({ themes })
})

jourdoc.post('/:wsId/themes', async (c) => {
  const wsId = c.get('wsId')
  const { parent_id, nom, nom_court } = await c.req.json()
  if (!nom) return c.json({ error: 'nom requis' }, 400)
  const [r] = await sql`
    INSERT INTO jd_themes (workspace_id, parent_id, nom, nom_court)
    VALUES (${wsId}, ${parent_id ?? null}, ${nom}, ${nom_court ?? null})
    RETURNING id
  `
  return c.json({ id: r.id }, 201)
})

jourdoc.put('/:wsId/themes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { parent_id, nom, nom_court } = await c.req.json()
  await sql`
    UPDATE jd_themes SET parent_id=${parent_id ?? null}, nom=${nom}, nom_court=${nom_court ?? null}
    WHERE id=${id} AND workspace_id=${wsId}
  `
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/themes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  await sql`DELETE FROM jd_themes WHERE id=${id} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

// ── NOTES ────────────────────────────────────────────────────

jourdoc.get('/:wsId/notes/search', async (c) => {
  const wsId = c.get('wsId')
  const q = c.req.query('q') ?? ''
  const exclude = Number(c.req.query('exclude') ?? 0)
  const like = `%${q}%`
  const notes = await sql`
    SELECT id, titre, titre_alt, type, nature, date, theme_id, doc_categorie_id,
      (SELECT nom FROM jd_themes WHERE id = theme_id) AS theme_nom,
      (SELECT json_build_object('id', dc.id, 'nom', dc.nom, 'icon', dc.icon, 'couleur', dc.couleur)
        FROM jd_doc_categorie dc WHERE dc.id = jd_notes.doc_categorie_id) AS doc_categorie,
      (SELECT json_build_object('id', ds.id, 'nom', ds.nom, 'icon', ds.icon, 'couleur', ds.couleur)
        FROM jd_doc_statut ds WHERE ds.id = jd_notes.doc_statut_id) AS doc_statut
    FROM jd_notes
    WHERE workspace_id = ${wsId} AND id != ${exclude || -1}
      AND (titre ILIKE ${like} OR titre_alt ILIKE ${like})
    ORDER BY date DESC, created_at DESC
    LIMIT 25
  `
  return c.json({ notes: notes.map(normalizeNote) })
})

jourdoc.get('/:wsId/notes', async (c) => {
  const wsId = c.get('wsId')
  const { type, nature, date_from, date_to, objet_id, theme_id } = c.req.query()

  let query = `
    SELECT DISTINCT n.*, t.nom AS theme_nom
    FROM jd_notes n
    LEFT JOIN jd_themes t ON t.id = n.theme_id
  `
  const params = [wsId]
  let pi = 2
  if (objet_id) { query += ' JOIN jd_note_objet no ON no.note_id = n.id'; }
  query += ` WHERE n.workspace_id = $1`
  if (type)      { query += ` AND n.type = $${pi++}`;      params.push(type) }
  if (nature)    { query += ` AND n.nature = $${pi++}`;    params.push(nature) }
  if (date_from) { query += ` AND n.date >= $${pi++}`;     params.push(date_from) }
  if (date_to)   { query += ` AND n.date <= $${pi++}`;     params.push(date_to) }
  if (objet_id)  { query += ` AND no.objet_id = $${pi++}`; params.push(Number(objet_id)) }
  if (theme_id)  { query += ` AND EXISTS (SELECT 1 FROM jd_note_theme nt WHERE nt.note_id = n.id AND nt.theme_id = $${pi++})`; params.push(Number(theme_id)) }
  query += ' ORDER BY n.date DESC, n.created_at DESC'

  const notes = await sql(query, params)
  return c.json({ notes: await withData(notes) })
})

jourdoc.get('/:wsId/notes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const [note] = await sql`
    SELECT n.*, t.nom AS theme_nom FROM jd_notes n
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE n.id = ${id} AND n.workspace_id = ${wsId}
  `
  if (!note) return c.json({ error: 'Not found' }, 404)

  const [objets, themes, medias, liens, liensEntrants, elements] = await Promise.all([
    sql`SELECT o.id, o.nom, o.nom_court FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ${id}`,
    sql`SELECT t.id, t.nom, t.nom_court FROM jd_note_theme nt JOIN jd_themes t ON t.id = nt.theme_id WHERE nt.note_id = ${id} ORDER BY t.nom`,
    sql`SELECT m.id, m.type_media, m.nom_original, m.fichier FROM jd_note_media nm JOIN jd_medias m ON m.id = nm.media_id WHERE nm.note_id = ${id} ORDER BY m.created_at`,
    sql`SELECT nn.note_cible_id AS id, nn.type_lien, n.titre, n.titre_alt, n.type, n.nature, n.date, n.created_at,
      (SELECT json_build_object('id',dc.id,'nom',dc.nom,'icon',dc.icon,'couleur',dc.couleur) FROM jd_doc_categorie dc WHERE dc.id = n.doc_categorie_id) AS doc_categorie
      FROM jd_note_note nn JOIN jd_notes n ON n.id = nn.note_cible_id WHERE nn.note_source_id = ${id} ORDER BY n.date ASC, n.created_at ASC`,
    sql`SELECT nn.note_source_id AS id, nn.type_lien, n.titre, n.titre_alt, n.type, n.nature, n.date, n.created_at,
      (SELECT json_build_object('id',dc.id,'nom',dc.nom,'icon',dc.icon,'couleur',dc.couleur) FROM jd_doc_categorie dc WHERE dc.id = n.doc_categorie_id) AS doc_categorie
      FROM jd_note_note nn JOIN jd_notes n ON n.id = nn.note_source_id WHERE nn.note_cible_id = ${id} ORDER BY n.date ASC, n.created_at ASC`,
    sql`SELECT e.id, e.nom FROM jd_note_element ne JOIN jd_elements e ON e.id = ne.element_id WHERE ne.note_id = ${id} ORDER BY e.nom`,
  ])

  const doc_categorie = await docCategorie(note.doc_categorie_id)
  const doc_statut = await docStatutRef(note.doc_statut_id)
  const fmtN = n => ({ ...n, date: fmtDate(n.date) })
  return c.json({ note: { ...normalizeNote(note), objets, themes, medias, liens: liens.map(fmtN), liensEntrants: liensEntrants.map(fmtN), elements, doc_categorie, doc_statut } })
})

jourdoc.post('/:wsId/notes', async (c) => {
  const wsId = c.get('wsId')
  const body = await c.req.json()
  const { type = 'journal', nature, titre, titre_alt, contenu, date, source_url, objet_ids = [], media_ids = [], element_ids = [] } = body
  // theme_ids = source de vérité ; theme_id (legacy) accepté en repli
  const theme_ids = Array.isArray(body.theme_ids) ? body.theme_ids : (body.theme_id != null ? [body.theme_id] : [])
  const primaryTheme = theme_ids[0] ?? null
  // champs propres à la documentation (NULL pour le journal)
  const isDoc = type === 'documentation'
  const docCategorieId = isDoc ? (body.doc_categorie_id ?? null) : null
  const docStatutId    = isDoc ? (body.doc_statut_id ?? null) : null
  const docAuteur      = isDoc ? (body.doc_auteur?.trim() || null) : null
  const docReference   = isDoc ? (body.doc_reference?.trim() || null) : null
  if (!titre) return c.json({ error: 'titre requis' }, 400)

  const [r] = await sql`
    INSERT INTO jd_notes (workspace_id, type, nature, theme_id, doc_categorie_id, doc_statut_id, doc_auteur, doc_reference, titre, titre_alt, contenu, date, source_url)
    VALUES (${wsId}, ${type}, ${nature ?? null}, ${primaryTheme}, ${docCategorieId}, ${docStatutId}, ${docAuteur}, ${docReference}, ${titre}, ${titre_alt ?? null}, ${contenu ?? null}, ${date ?? null}, ${source_url ?? null})
    RETURNING id
  `
  const noteId = r.id

  for (const themeId of theme_ids)
    await sql`INSERT INTO jd_note_theme (note_id, theme_id) VALUES (${noteId}, ${themeId}) ON CONFLICT DO NOTHING`
  for (const objetId of objet_ids)
    await sql`INSERT INTO jd_note_objet (note_id, objet_id) VALUES (${noteId}, ${objetId}) ON CONFLICT DO NOTHING`
  for (const mediaId of media_ids) {
    await sql`INSERT INTO jd_note_media (note_id, media_id) VALUES (${noteId}, ${mediaId}) ON CONFLICT DO NOTHING`
    await refreshLie(mediaId)
  }
  for (const elementId of element_ids)
    await sql`INSERT INTO jd_note_element (note_id, element_id) VALUES (${noteId}, ${elementId}) ON CONFLICT DO NOTHING`

  return c.json({ id: noteId }, 201)
})

jourdoc.put('/:wsId/notes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const { type, nature, titre, titre_alt, contenu, date, source_url, objet_ids, media_ids, element_ids } = body
  // theme_ids = source de vérité ; theme_id (legacy) accepté en repli
  const theme_ids = body.theme_ids !== undefined
    ? (Array.isArray(body.theme_ids) ? body.theme_ids : [])
    : (body.theme_id !== undefined ? (body.theme_id != null ? [body.theme_id] : []) : undefined)
  const primaryTheme = theme_ids ? (theme_ids[0] ?? null) : (body.theme_id ?? null)
  // champs propres à la documentation (NULL pour le journal)
  const isDoc = type === 'documentation'
  const docCategorieId = isDoc ? (body.doc_categorie_id ?? null) : null
  const docStatutId    = isDoc ? (body.doc_statut_id ?? null) : null
  const docAuteur      = isDoc ? (body.doc_auteur?.trim() || null) : null
  const docReference   = isDoc ? (body.doc_reference?.trim() || null) : null

  await sql`
    UPDATE jd_notes SET type=${type}, nature=${nature ?? null}, theme_id=${primaryTheme},
      doc_categorie_id=${docCategorieId}, doc_statut_id=${docStatutId}, doc_auteur=${docAuteur}, doc_reference=${docReference},
      titre=${titre}, titre_alt=${titre_alt ?? null}, contenu=${contenu ?? null},
      date=${date ?? null}, source_url=${source_url ?? null}, updated_at=NOW()
    WHERE id=${id} AND workspace_id=${wsId}
  `

  if (theme_ids !== undefined) {
    await sql`DELETE FROM jd_note_theme WHERE note_id = ${id}`
    for (const themeId of theme_ids)
      await sql`INSERT INTO jd_note_theme (note_id, theme_id) VALUES (${id}, ${themeId}) ON CONFLICT DO NOTHING`
  }

  if (objet_ids !== undefined) {
    await sql`DELETE FROM jd_note_objet WHERE note_id = ${id}`
    for (const objetId of objet_ids)
      await sql`INSERT INTO jd_note_objet (note_id, objet_id) VALUES (${id}, ${objetId}) ON CONFLICT DO NOTHING`
  }

  if (media_ids !== undefined) {
    const old = (await sql`SELECT media_id FROM jd_note_media WHERE note_id = ${id}`).map(r => r.media_id)
    await sql`DELETE FROM jd_note_media WHERE note_id = ${id}`
    for (const mediaId of media_ids)
      await sql`INSERT INTO jd_note_media (note_id, media_id) VALUES (${id}, ${mediaId}) ON CONFLICT DO NOTHING`
    for (const mediaId of [...new Set([...old, ...media_ids])]) await refreshLie(mediaId)
  }

  if (element_ids !== undefined) {
    await sql`DELETE FROM jd_note_element WHERE note_id = ${id}`
    for (const elementId of element_ids)
      await sql`INSERT INTO jd_note_element (note_id, element_id) VALUES (${id}, ${elementId}) ON CONFLICT DO NOTHING`
  }

  return c.json({ ok: true })
})

jourdoc.post('/:wsId/notes/:id/liens', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { note_cible_id, type_lien } = await c.req.json()
  if (!note_cible_id || note_cible_id === id) return c.json({ error: 'Invalid target' }, 400)
  const [target] = await sql`SELECT id FROM jd_notes WHERE id = ${note_cible_id} AND workspace_id = ${wsId}`
  if (!target) return c.json({ error: 'Not found' }, 404)
  await sql`
    INSERT INTO jd_note_note (note_source_id, note_cible_id, type_lien)
    VALUES (${id}, ${note_cible_id}, ${type_lien ?? null})
    ON CONFLICT DO NOTHING
  `
  return c.json({ ok: true }, 201)
})

jourdoc.delete('/:wsId/notes/:id/liens/:cibleId', async (c) => {
  const id = Number(c.req.param('id'))
  const cibleId = Number(c.req.param('cibleId'))
  await sql`DELETE FROM jd_note_note WHERE note_source_id = ${id} AND note_cible_id = ${cibleId}`
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/notes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  await sql`DELETE FROM jd_notes WHERE id=${id} AND workspace_id=${wsId}`
  return c.json({ ok: true })
})

// ── MÉDIAS ───────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['jpg','jpeg','png','gif','webp','heic','heif','avif','pdf','md','markdown'])
const MARKDOWN_EXTS = new Set(['md','markdown'])
const IMAGE_EXTS   = new Set(['jpg','jpeg','png','gif','webp','heic','heif','avif'])
const HEIC_EXTS    = new Set(['heic','heif'])
const MAX_DIM = 1600

function detectMagicFormat(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png'
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'heif'
  return null
}

async function extractExifDate(buffer) {
  try {
    const { default: ExifReader } = await import('exifreader')
    const tags = ExifReader.load(buffer, { expanded: false })
    const raw = (tags['DateTimeOriginal'] ?? tags['DateTime'] ?? tags['DateTimeDigitized'])?.description
    if (raw && /^\d{4}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 10).replace(/:/g, '-')
  } catch { /* pas d'EXIF lisible */ }
  return null
}

async function processImage(buffer, ext) {
  if (!IMAGE_EXTS.has(ext)) return { buf: buffer, outExt: ext, size: buffer.length }
  const magic = detectMagicFormat(buffer)
  const isActuallyHeic = HEIC_EXTS.has(ext) && magic !== 'jpeg' && magic !== 'png' && magic !== 'webp'
  const outExt = HEIC_EXTS.has(ext) ? 'jpg' : (ext === 'jpeg' ? 'jpg' : ext)
  try {
    const { default: sharp } = await import('sharp')
    const img = sharp(buffer)
    const meta = await img.metadata()
    const needsResize = (meta.width ?? 0) > MAX_DIM || (meta.height ?? 0) > MAX_DIM
    const needsConvert = isActuallyHeic
    if (!needsResize && !needsConvert) return { buf: buffer, outExt, size: buffer.length }
    let pipeline = needsResize
      ? img.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      : img
    if (needsConvert) pipeline = pipeline.jpeg({ quality: 90 })
    const out = await pipeline.withMetadata().toBuffer()
    return { buf: out, outExt, size: out.length }
  } catch {
    if (isActuallyHeic) {
      try {
        const { default: heicConvert } = await import('heic-convert')
        const jpegBuf = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 0.9 }))
        return { buf: jpegBuf, outExt: 'jpg', size: jpegBuf.length }
      } catch (e2) {
        console.error('[HEIC] heic-convert failed:', e2?.message)
      }
    }
    return { buf: buffer, outExt, size: buffer.length }
  }
}

jourdoc.post('/:wsId/medias', async (c) => {
  const wsId = c.get('wsId')
  try {
    const body = await c.req.parseBody({ all: true })

    const raw = body['files'] ?? body['file']
    const files = Array.isArray(raw) ? raw : raw ? [raw] : []
    if (files.length === 0) return c.json({ error: 'Aucun fichier' }, 400)

    const fallbackDate = (typeof body.date_prise === 'string' && body.date_prise)
      || new Date().toISOString().slice(0, 10)

    const results = []
    for (const file of files) {
      if (!file || typeof file === 'string') continue
      const ext = (file.name.split('.').pop() ?? '').toLowerCase()
      if (!ALLOWED_EXTS.has(ext)) continue

      const isMd = MARKDOWN_EXTS.has(ext)
      const typeMedia = ext === 'pdf' ? 'pdf' : isMd ? 'markdown' : 'photo'
      const rawBuf = Buffer.from(await file.arrayBuffer())
      const exifDate = isMd ? null : await extractExifDate(rawBuf)
      const datePrise = exifDate ?? fallbackDate

      const { buf, outExt, size } = isMd
        ? { buf: rawBuf, outExt: 'md', size: rawBuf.length }
        : await processImage(rawBuf, ext)
      const mime = isMd ? 'text/markdown' : (file.type || null)
      const filename = `${randomUUID()}.${outExt}`

      const filepath = await uploadFile(`${process.env.WEBDAV_PATH_UPLOADS}/${wsId}`, filename, buf, mime)

      const [r] = await sql`
        INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, taille, date_prise)
        VALUES (${wsId}, ${filepath}, ${file.name}, ${typeMedia}, ${mime}, ${size}, ${datePrise})
        RETURNING id
      `
      results.push({ id: r.id, fichier: filepath, nom_original: file.name, type_media: typeMedia, date_prise: datePrise })
    }

    if (results.length === 0) return c.json({ error: 'Aucun fichier valide' }, 400)
    return c.json({ medias: results }, 201)
  } catch (err) {
    console.error('[upload] error:', err.message, err.stack)
    return c.json({ error: 'Upload failed', detail: err.message }, 500)
  }
})

// ── DOCUMENTS MARKDOWN ───────────────────────────────────────

// Créer un document .md vierge ou avec contenu (média de type 'markdown')
jourdoc.post('/:wsId/medias/markdown', async (c) => {
  const wsId = c.get('wsId')
  const { nom, content = '' } = await c.req.json()
  const baseName = (nom?.trim() || 'Document').replace(/\.md$/i, '')
  const buf = Buffer.from(content, 'utf8')
  const filename = `${randomUUID()}.md`
  const filepath = await uploadFile(`${process.env.WEBDAV_PATH_UPLOADS}/${wsId}`, filename, buf, 'text/markdown')
  const [r] = await sql`
    INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, taille, date_prise)
    VALUES (${wsId}, ${filepath}, ${baseName + '.md'}, 'markdown', 'text/markdown', ${buf.length}, ${new Date().toISOString().slice(0, 10)})
    RETURNING id
  `
  return c.json({ id: r.id, fichier: filepath, nom_original: baseName + '.md', type_media: 'markdown' }, 201)
})

// Lire le contenu texte d'un document markdown
jourdoc.get('/:wsId/medias/:id/content', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const [media] = await sql`SELECT * FROM jd_medias WHERE id=${id} AND workspace_id=${wsId}`
  if (!media) return c.json({ error: 'Not found' }, 404)
  try {
    const content = await getTextFile(media.fichier)
    // Images relatives résolues côté front via le proxy /medias/:id/relfile (dossier réel du média)
    return c.json({ content, nom_original: media.nom_original, externe: !!media.externe })
  } catch {
    return c.json({ error: 'Read failed' }, 500)
  }
})

// Réenregistrer le contenu d'un document markdown
jourdoc.put('/:wsId/medias/:id/content', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { content = '', nom } = await c.req.json()
  const [media] = await sql`SELECT * FROM jd_medias WHERE id=${id} AND workspace_id=${wsId}`
  if (!media) return c.json({ error: 'Not found' }, 404)
  try {
    await putTextFile(media.fichier, content)
    const taille = Buffer.byteLength(content, 'utf8')
    const newNom = nom?.trim() ? nom.trim().replace(/\.md$/i, '') + '.md' : media.nom_original
    await sql`UPDATE jd_medias SET taille=${taille}, nom_original=${newNom} WHERE id=${id}`
    return c.json({ ok: true, nom_original: newNom })
  } catch {
    return c.json({ error: 'Write failed' }, 500)
  }
})

// ── FICHIERS EXTERNES LIÉS (dossier WEBDAV_PATH_EXTDOCS) ──────

const EXTDOCS = () => (process.env.WEBDAV_PATH_EXTDOCS || '').trim()
// Racine des docs liés PAR WORKSPACE : external/{wsId}/. Les chemins relatifs des
// routes EXTDOCS sont relatifs à cette racine.
const extdocsRoot = (wsId) => `${EXTDOCS()}/${wsId}`
// Nettoie un chemin relatif (interdit toute évasion hors EXTDOCS)
function cleanRel(p) {
  return String(p || '').split('/').filter(s => s && s !== '.' && s !== '..').join('/')
}
function extType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (MARKDOWN_EXTS.has(ext)) return 'markdown'
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_EXTS.has(ext)) return 'photo'
  return 'fichier'
}
function mimeForName(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', pdf: 'application/pdf',
    md: 'text/markdown', markdown: 'text/markdown' })[ext] || 'application/octet-stream'
}

// Arborescence du dossier externe (dossiers + fichiers)
jourdoc.get('/:wsId/extdocs/tree', async (c) => {
  if (!EXTDOCS()) return c.json({ error: 'EXTDOCS non configuré', entries: [] }, 200)
  const root = extdocsRoot(c.get('wsId'))
  const rel = cleanRel(c.req.query('path'))
  const full = rel ? `${root}/${rel}` : root
  try {
    const items = await listDir(full)
    const entries = items
      .map(i => ({ name: i.name, dir: i.type === 'directory' }))
      .sort((a, b) => (Number(b.dir) - Number(a.dir)) || a.name.localeCompare(b.name, 'fr'))
    return c.json({ path: rel, entries })
  } catch (e) {
    console.error('[extdocs/tree] error:', e?.status, e?.message)
    return c.json({ error: `Lecture impossible (${e?.status || ''} ${(e?.message || '').slice(0, 100)})`, entries: [] }, 500)
  }
})

// Lier un fichier externe (référence, sans copie)
jourdoc.post('/:wsId/medias/link', async (c) => {
  const wsId = c.get('wsId')
  if (!EXTDOCS()) return c.json({ error: 'EXTDOCS non configuré' }, 400)
  const rel = cleanRel((await c.req.json()).path)
  if (!rel) return c.json({ error: 'Chemin requis' }, 400)
  const full = `${extdocsRoot(wsId)}/${rel}`
  const name = rel.split('/').pop()
  const tm = extType(name)
  // Le listing/stat WebDAV (PROPFIND) est indisponible sur ce partage → on vérifie
  // l'existence par un GET direct (qui, lui, fonctionne).
  try {
    const ls = full.lastIndexOf('/')
    await downloadFile(full.substring(0, ls), full.substring(ls + 1))
  } catch {
    return c.json({ error: 'Fichier introuvable sous external/ (vérifie le chemin)' }, 404)
  }
  const [existing] = await sql`SELECT id FROM jd_medias WHERE workspace_id=${wsId} AND fichier=${full}`
  if (existing) return c.json({ id: existing.id, existing: true, nom_original: name, type_media: tm, externe: true })
  const [r] = await sql`
    INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, externe, date_prise)
    VALUES (${wsId}, ${full}, ${name}, ${tm}, ${mimeForName(name)}, TRUE, ${new Date().toISOString().slice(0, 10)})
    RETURNING id
  `
  return c.json({ id: r.id, fichier: full, nom_original: name, type_media: tm, externe: true }, 201)
})

// Proxy : sert un fichier sous EXTDOCS (images relatives des MD liés, etc.)
jourdoc.get('/:wsId/extdocs/file', async (c) => {
  if (!EXTDOCS()) return c.json({ error: 'EXTDOCS non configuré' }, 404)
  const rel = cleanRel(c.req.query('path'))
  if (!rel) return c.json({ error: 'path requis' }, 400)
  const full = `${extdocsRoot(c.get('wsId'))}/${rel}`
  try {
    const lastSlash = full.lastIndexOf('/')
    const buf = await downloadFile(full.substring(0, lastSlash), full.substring(lastSlash + 1))
    c.header('Content-Type', mimeForName(full))
    c.header('Cache-Control', 'private, max-age=3600')
    return c.body(buf)
  } catch {
    return c.json({ error: 'Download failed' }, 500)
  }
})

// Proxy : fichier relatif au dossier d'un média (images d'un MD, lié OU uploadé).
// Marche pour external ET uploads (résolution = dossier réel du média).
jourdoc.get('/:wsId/medias/:id/relfile', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const rel = cleanRel(c.req.query('rel'))
  if (!rel) return c.json({ error: 'rel requis' }, 400)
  const [media] = await sql`SELECT fichier FROM jd_medias WHERE id=${id} AND workspace_id=${wsId}`
  if (!media) return c.json({ error: 'Not found' }, 404)
  const dir = media.fichier.substring(0, media.fichier.lastIndexOf('/'))
  const full = `${dir}/${rel}`
  try {
    const ls = full.lastIndexOf('/')
    const buf = await downloadFile(full.substring(0, ls), full.substring(ls + 1))
    c.header('Content-Type', mimeForName(full))
    c.header('Cache-Control', 'private, max-age=3600')
    return c.body(buf)
  } catch {
    return c.json({ error: 'Download failed' }, 500)
  }
})

// Créer un nouveau document .md dans un dossier externe et le lier
jourdoc.post('/:wsId/extdocs/create', async (c) => {
  const wsId = c.get('wsId')
  if (!EXTDOCS()) return c.json({ error: 'EXTDOCS non configuré' }, 400)
  const body = await c.req.json()
  const folder = cleanRel(body.path)
  let name = String(body.name || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 120)
  if (!name) return c.json({ error: 'Nom requis' }, 400)
  if (!/\.(md|markdown)$/i.test(name)) name += '.md'
  const rel = folder ? `${folder}/${name}` : name
  const full = `${extdocsRoot(wsId)}/${rel}`
  const [existing] = await sql`SELECT id FROM jd_medias WHERE workspace_id=${wsId} AND fichier=${full}`
  if (existing) return c.json({ error: 'Un document de ce nom existe déjà ici' }, 409)
  try {
    await putTextFile(full, `# ${name.replace(/\.(md|markdown)$/i, '')}\n\n`)
  } catch {
    return c.json({ error: 'Création impossible' }, 500)
  }
  const [r] = await sql`
    INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, externe, date_prise)
    VALUES (${wsId}, ${full}, ${name}, 'markdown', 'text/markdown', TRUE, ${new Date().toISOString().slice(0, 10)})
    RETURNING id`
  return c.json({ id: r.id, fichier: full, nom_original: name, type_media: 'markdown', externe: true }, 201)
})

// Upload d'une image collée → dossier d'assets du document (_<nom>.assets/), à côté du .md.
// Retourne le chemin RELATIF (à insérer dans le markdown) ; l'affichage passe par relfile.
jourdoc.post('/:wsId/medias/:id/asset', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const [media] = await sql`SELECT fichier FROM jd_medias WHERE id=${id} AND workspace_id=${wsId}`
  if (!media) return c.json({ error: 'Not found' }, 404)
  const slash = media.fichier.lastIndexOf('/')
  const dir = media.fichier.substring(0, slash)
  // Nom du dossier d'assets : caractères spéciaux (#^[]|*\<>:?/ espace) → « _ »
  const base = media.fichier.substring(slash + 1)
    .replace(/\.(md|markdown)$/i, '')
    .replace(/[#^[\]|*\\<>:?\/\s]/g, '_')
  const origName = c.req.query('name') || 'image.png'
  let ext = (origName.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  if (ext === 'jpeg') ext = 'jpg'
  const buf = Buffer.from(await c.req.arrayBuffer())
  if (!buf.length) return c.json({ error: 'Vide' }, 400)
  const assetDir = `${dir}/_${base}.assets`
  const filename = `${randomUUID()}.${ext}`
  try {
    await uploadFile(assetDir, filename, buf, mimeForName(filename))
  } catch {
    return c.json({ error: 'Upload échoué' }, 500)
  }
  return c.json({ rel: `_${base}.assets/${filename}` }, 201)
})

jourdoc.get('/:wsId/medias', async (c) => {
  const wsId = c.get('wsId')
  const { date_from, date_to, type_media, lie } = c.req.query()

  let query = 'SELECT * FROM jd_medias WHERE workspace_id = $1'
  const params = [wsId]; let pi = 2
  if (date_from)  { query += ` AND date_prise >= $${pi++}`; params.push(date_from) }
  if (date_to)    { query += ` AND date_prise <= $${pi++}`; params.push(date_to) }
  if (type_media) { query += ` AND type_media = $${pi++}`;  params.push(type_media) }
  if (lie !== undefined) { query += ` AND lie = $${pi++}`; params.push(lie === '1' || lie === 'true') }
  query += ' ORDER BY date_prise DESC, created_at DESC'

  const medias = await sql(query, params)
  return c.json({ medias: medias.map(m => ({ ...m, date_prise: fmtDate(m.date_prise) })) })
})

// Proxy de téléchargement — stream le fichier depuis KDrive WebDAV
jourdoc.get('/:wsId/medias/:id/file', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const [media] = await sql`SELECT * FROM jd_medias WHERE id=${id} AND workspace_id=${wsId}`
  if (!media) return c.json({ error: 'Not found' }, 404)

  try {
    // Dériver dir depuis fichier (compatible flat et sous-dossiers par workspace)
    const lastSlash = media.fichier.lastIndexOf('/')
    const dir = media.fichier.substring(0, lastSlash)
    const filename = media.fichier.substring(lastSlash + 1)
    const buf = await downloadFile(dir, filename)

    const mimeType = media.mime_type || (media.type_media === 'pdf' ? 'application/pdf' : media.type_media === 'markdown' ? 'text/markdown' : 'image/jpeg')
    c.header('Content-Type', mimeType)
    c.header('Content-Disposition', `inline; filename="${media.nom_original ?? filename}"`)
    c.header('Cache-Control', 'private, max-age=86400')
    return c.body(buf)
  } catch (err) {
    return c.json({ error: 'Download failed' }, 500)
  }
})

jourdoc.delete('/:wsId/medias/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const [media] = await sql`SELECT * FROM jd_medias WHERE id=${id} AND workspace_id=${wsId}`
  if (!media) return c.json({ error: 'Not found' }, 404)

  // Fichier lié (externe) : on ne supprime QUE la référence, jamais l'original
  if (!media.externe) {
    const lastSlash = media.fichier.lastIndexOf('/')
    try {
      await deleteFile(media.fichier.substring(0, lastSlash), media.fichier.substring(lastSlash + 1))
    } catch { /* fichier déjà absent */ }
  }
  await sql`DELETE FROM jd_medias WHERE id=${id}`
  return c.json({ ok: true })
})

jourdoc.get('/:wsId/notes/:id/medias', async (c) => {
  const wsId = c.get('wsId')
  const noteId = Number(c.req.param('id'))
  const medias = await sql`
    SELECT m.* FROM jd_note_media nm JOIN jd_medias m ON m.id = nm.media_id
    WHERE nm.note_id = ${noteId} AND m.workspace_id = ${wsId} ORDER BY m.created_at
  `
  return c.json({ medias })
})

jourdoc.get('/:wsId/medias/:id/notes', async (c) => {
  const wsId = c.get('wsId')
  const mediaId = Number(c.req.param('id'))
  const notes = await sql`
    SELECT DISTINCT n.*, t.nom AS theme_nom
    FROM jd_notes n
    JOIN jd_note_media nm ON nm.note_id = n.id
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE nm.media_id = ${mediaId} AND n.workspace_id = ${wsId}
    ORDER BY n.date DESC, n.created_at DESC
  `
  return c.json({ notes: await withData(notes) })
})

jourdoc.put('/:wsId/notes/:id/medias', async (c) => {
  const wsId = c.get('wsId')
  const noteId = Number(c.req.param('id'))
  const { media_ids = [] } = await c.req.json()
  const old = (await sql`SELECT media_id FROM jd_note_media WHERE note_id = ${noteId}`).map(r => r.media_id)
  await sql`DELETE FROM jd_note_media WHERE note_id = ${noteId}`
  for (const mediaId of media_ids)
    await sql`INSERT INTO jd_note_media (note_id, media_id) VALUES (${noteId}, ${mediaId}) ON CONFLICT DO NOTHING`
  for (const mediaId of [...new Set([...old, ...media_ids])]) await refreshLie(mediaId)
  return c.json({ ok: true })
})

// ── TODOIST ──────────────────────────────────────────────────

const TODOIST_API = 'https://api.todoist.com/api/v1'

function todoistHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}
function todoistAuthHeader(token) {
  return { Authorization: `Bearer ${token}` }
}
function extractTask(data) {
  if (!data) return null
  if (data.id) return data
  if (data.task?.id) return data.task
  if (data.item?.id) return data.item
  if (Array.isArray(data.results) && data.results[0]?.id) return data.results[0]
  if (Array.isArray(data) && data[0]?.id) return data[0]
  return data
}

function notePublicUrl(c, wsId, noteId) {
  const proto = c.req.header('x-forwarded-proto') || 'https'
  const host  = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost'
  return `${proto}://${host}/jourdoc/${wsId}/notes/${noteId}`
}

const syncTimestamps = new Map()

jourdoc.get('/:wsId/todoist', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const [ws] = await sql`SELECT todoist_token, todoist_project_id, todoist_project_nom FROM workspaces WHERE id=${wsId}`
  return c.json({
    configured:  Boolean(ws?.todoist_token),
    project_id:  ws?.todoist_project_id  ?? null,
    project_nom: ws?.todoist_project_nom ?? null,
    last_sync_at: syncTimestamps.get(wsId) ?? null,
  })
})

jourdoc.post('/:wsId/todoist/sync', wsCheck, async (c) => {
  try {
    const wsId = c.get('wsId')
    const [ws] = await sql`SELECT todoist_token FROM workspaces WHERE id=${wsId}`
    if (!ws?.todoist_token) return c.json({ ok: false, error: 'Todoist non configuré' })

    const notes = await sql`
      SELECT id, tache_todoist_id, tache_todoist_due FROM jd_notes
      WHERE workspace_id=${wsId} AND tache_todoist_id IS NOT NULL
        AND (tache_todoist_done IS NULL OR tache_todoist_done = FALSE)
    `

    let completed = 0, errors = 0
    for (const note of notes) {
      try {
        const res = await fetch(`${TODOIST_API}/tasks/${note.tache_todoist_id}?include_completed=true`, {
          headers: todoistAuthHeader(ws.todoist_token)
        })
        if (res.status === 404) {
          await sql`UPDATE jd_notes SET tache_todoist_done=TRUE WHERE id=${note.id}`
          completed++; continue
        }
        if (!res.ok) { errors++; continue }
        const task = extractTask(await res.json())
        const isDone = Boolean(task?.checked || task?.completed_at || task?.is_completed)
        const currentDue = task?.due?.date ?? null
        const isRecurring = !isDone && note.tache_todoist_due && currentDue && currentDue > note.tache_todoist_due
        const taskContent = task?.content ?? null
        if (isRecurring) {
          await sql`UPDATE jd_notes SET tache_todoist_due=${currentDue}, tache_todoist_priority=${task?.priority ?? null}, tache_todoist_recurrence_done=TRUE, tache_todoist_content=${taskContent} WHERE id=${note.id}`
          completed++
        } else {
          await sql`UPDATE jd_notes SET tache_todoist_due=${currentDue}, tache_todoist_priority=${task?.priority ?? null}, tache_todoist_done=${isDone}, tache_todoist_content=${taskContent} WHERE id=${note.id}`
          if (isDone) completed++
        }
      } catch { errors++ }
    }

    const syncedAt = new Date().toISOString()
    syncTimestamps.set(wsId, syncedAt)
    return c.json({ ok: true, synced: notes.length, completed, errors, synced_at: syncedAt })
  } catch (e) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500)
  }
})

jourdoc.get('/:wsId/todoist/tasks', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  try {
  const notes = await sql`
    SELECT n.id, n.titre, n.titre_alt, n.date, n.type, n.nature,
           n.tache_todoist_id, n.tache_todoist_done, n.tache_todoist_due,
           n.tache_todoist_priority, n.tache_todoist_recurrence_done,
           COALESCE(n.tache_todoist_consigne, FALSE) AS tache_todoist_consigne,
           n.tache_todoist_content,
           t.nom AS theme_nom
    FROM jd_notes n
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE n.workspace_id = ${wsId} AND n.tache_todoist_id IS NOT NULL
    ORDER BY n.tache_todoist_done ASC, n.tache_todoist_recurrence_done DESC,
             n.tache_todoist_due ASC, n.date DESC
  `
  const withObjets = await Promise.all(notes.map(async n => ({
    ...normalizeNote(n),
    objets: await sql`SELECT o.id, o.nom FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ${n.id}`,
    themes: await sql`SELECT t.id, t.nom FROM jd_note_theme nt JOIN jd_themes t ON t.id = nt.theme_id WHERE nt.note_id = ${n.id} ORDER BY t.nom`,
  })))
  return c.json({ notes: withObjets })
  } catch (err) {
    console.error('[todoist/tasks] error:', err.message)
    return c.json({ error: err.message, notes: [] }, 500)
  }
})

jourdoc.put('/:wsId/todoist', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { token, project_id, project_nom } = await c.req.json()
  await sql`
    UPDATE workspaces SET todoist_token=${token?.trim() || null}, todoist_project_id=${project_id || null}, todoist_project_nom=${project_nom || null}
    WHERE id=${wsId}
  `
  return c.json({ ok: true })
})

jourdoc.post('/:wsId/todoist/projects', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const body = await c.req.json().catch(() => ({}))
  let token = (body.token ?? '').trim()
  if (!token) {
    const [ws] = await sql`SELECT todoist_token FROM workspaces WHERE id=${wsId}`
    token = (ws?.todoist_token ?? '').trim()
  }
  if (!token) return c.json({ error: 'Aucun token' }, 400)
  try {
    const res = await fetch(`${TODOIST_API}/projects`, { headers: todoistHeaders(token) })
    if (!res.ok) {
      const b = await res.text().catch(() => '')
      return c.json({ error: `Todoist a répondu HTTP ${res.status} — ${b.slice(0, 200) || 'pas de détail'}` }, 400)
    }
    const data = await res.json()
    const list = Array.isArray(data) ? data : (data.results ?? data.items ?? [])
    return c.json({ projects: list.map(p => ({ id: p.id, name: p.name })) })
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

jourdoc.post('/:wsId/notes/:noteId/todoist', wsCheck, async (c) => {
  const wsId  = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const { due_date, priority = 2, recurrence, titre: titreTask } = await c.req.json()

  const [ws]   = await sql`SELECT todoist_token, todoist_project_id FROM workspaces WHERE id=${wsId}`
  if (!ws?.todoist_token) return c.json({ error: 'Todoist non configuré' }, 400)

  const [note] = await sql`SELECT titre, date FROM jd_notes WHERE id=${noteId} AND workspace_id=${wsId}`
  if (!note) return c.json({ error: 'Note introuvable' }, 404)

  const noteUrl = notePublicUrl(c, wsId, noteId)
  const dateStr = note.date ? `\nDate : ${note.date}` : ''
  const taskBody = {
    content:     titreTask?.trim() || note.titre,
    description: `Source : [${note.titre}](${noteUrl})${dateStr}`,
    project_id:  ws.todoist_project_id || undefined,
    priority:    Number(priority) || 2,
  }
  if (recurrence) taskBody.due_string = recurrence
  else if (due_date) taskBody.due_date = due_date

  try {
    const res = await fetch(`${TODOIST_API}/tasks`, {
      method: 'POST',
      headers: { ...todoistHeaders(ws.todoist_token), 'X-Request-Id': randomUUID() },
      body: JSON.stringify(taskBody),
    })
    if (!res.ok) {
      const err = await res.text()
      return c.json({ error: `Todoist: ${err}` }, 400)
    }
    const data = await res.json()
    const task = data.id ? data : (data.task ?? data.item ?? data)
    const cachedDue = task.due?.date ?? due_date ?? null
    const taskContent = task.content ?? taskBody.content ?? null
    await sql`
      UPDATE jd_notes SET tache_todoist_id=${task.id}, tache_todoist_due=${cachedDue},
        tache_todoist_priority=${Number(priority) || 2}, tache_todoist_done=FALSE, tache_todoist_content=${taskContent}
      WHERE id=${noteId}
    `
    return c.json({ task_id: task.id, url: `https://app.todoist.com/app/task/${task.id}` })
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

jourdoc.post('/:wsId/notes/:noteId/todoist/link', wsCheck, async (c) => {
  try {
    const wsId   = c.get('wsId')
    const noteId = Number(c.req.param('noteId'))
    const body   = await c.req.json().catch(() => ({}))
    const raw    = (body.task_url ?? '').trim()
    if (!raw) return c.json({ error: 'URL ou ID requis' }, 400)

    const [ws] = await sql`SELECT todoist_token FROM workspaces WHERE id=${wsId}`
    if (!ws?.todoist_token) return c.json({ error: 'Todoist non configuré' }, 400)

    const slug = raw.includes('/task/')
      ? raw.split('/task/').pop().split('?')[0].split('/')[0].trim()
      : raw.trim()
    let taskId = slug
    if (slug.includes('-')) {
      const segs = slug.split('-')
      for (let i = segs.length - 1; i >= 0; i--) {
        if (/[A-Z]/.test(segs[i]) && segs[i].length >= 8) { taskId = segs[i]; break }
      }
    }
    if (!taskId) return c.json({ error: "ID de tâche introuvable dans l'URL" }, 400)

    const res = await fetch(`${TODOIST_API}/tasks/${taskId}`, { headers: todoistAuthHeader(ws.todoist_token) })
    if (!res.ok) return c.json({ error: `Tâche introuvable dans Todoist (${res.status})` }, 400)
    const task = extractTask(await res.json())
    const isDone = Boolean(task?.checked || task?.completed_at || task?.is_completed)
    await sql`
      UPDATE jd_notes SET tache_todoist_id=${taskId}, tache_todoist_content=${task?.content ?? null},
        tache_todoist_due=${task?.due?.date ?? null}, tache_todoist_priority=${task?.priority ?? null},
        tache_todoist_done=${isDone}
      WHERE id=${noteId}
    `

    const [note] = await sql`SELECT titre FROM jd_notes WHERE id=${noteId}`
    const noteUrl = notePublicUrl(c, wsId, noteId)
    await fetch(`${TODOIST_API}/comments`, {
      method: 'POST',
      headers: { ...todoistHeaders(ws.todoist_token), 'X-Request-Id': randomUUID() },
      body: JSON.stringify({ task_id: taskId, content: `📔 Note JourDoc : [${note?.titre ?? 'Note'}](${noteUrl})` }),
    }).catch(() => {})

    return c.json({ ok: true, task_id: taskId, content: task?.content, url: `https://app.todoist.com/app/task/${taskId}` })
  } catch (e) {
    return c.json({ error: String(e?.message ?? e) }, 500)
  }
})

jourdoc.get('/:wsId/notes/:noteId/todoist', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const [ws]   = await sql`SELECT todoist_token FROM workspaces WHERE id=${wsId}`
  const [note] = await sql`SELECT tache_todoist_id FROM jd_notes WHERE id=${noteId} AND workspace_id=${wsId}`
  if (!note?.tache_todoist_id) return c.json({ linked: false })
  if (!ws?.todoist_token)      return c.json({ linked: true, error: 'Token manquant' })
  try {
    const taskId = note.tache_todoist_id
    const res = await fetch(`${TODOIST_API}/tasks/${taskId}?include_completed=true`, {
      headers: todoistAuthHeader(ws.todoist_token)
    })
    if (res.status === 404) return c.json({ linked: true, completed: true, task_id: taskId })
    if (!res.ok) {
      const b = await res.text().catch(() => '')
      return c.json({ linked: true, error: `Todoist ${res.status}: ${b.slice(0, 100)}` })
    }
    const task = extractTask(await res.json())
    const completed = Boolean(task?.checked || task?.completed_at || task?.is_completed)
    const dueDate = task?.due?.date ?? null
    const priority = task?.priority ?? null
    await sql`UPDATE jd_notes SET tache_todoist_due=${dueDate}, tache_todoist_priority=${priority}, tache_todoist_done=${completed} WHERE id=${noteId}`
    return c.json({ linked: true, completed, content: task?.content ?? null, due: task?.due ?? task?.deadline ?? null, priority, url: `https://app.todoist.com/app/task/${task?.id ?? taskId}`, task_id: task?.id ?? taskId })
  } catch (e) {
    return c.json({ linked: true, error: `Impossible de contacter Todoist : ${e.message}` })
  }
})

jourdoc.post('/:wsId/notes/:noteId/todoist/close', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const [ws]   = await sql`SELECT todoist_token FROM workspaces WHERE id=${wsId}`
  const [note] = await sql`SELECT tache_todoist_id FROM jd_notes WHERE id=${noteId} AND workspace_id=${wsId}`
  if (!note?.tache_todoist_id) return c.json({ error: 'Aucune tâche liée' }, 400)
  if (!ws?.todoist_token)      return c.json({ error: 'Todoist non configuré' }, 400)
  try {
    const res = await fetch(`${TODOIST_API}/tasks/${note.tache_todoist_id}/close`, {
      method: 'POST', headers: todoistAuthHeader(ws.todoist_token),
    })
    if (res.ok || res.status === 204) {
      await sql`UPDATE jd_notes SET tache_todoist_done=TRUE WHERE id=${noteId}`
      return c.json({ ok: true })
    }
    const b = await res.text().catch(() => '')
    return c.json({ error: `Todoist ${res.status}: ${b.slice(0, 200) || 'pas de détail'}` }, 400)
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

jourdoc.delete('/:wsId/notes/:noteId/todoist', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const { delete_in_todoist = false } = await c.req.json().catch(() => ({}))
  const [ws]   = await sql`SELECT todoist_token FROM workspaces WHERE id=${wsId}`
  const [note] = await sql`SELECT tache_todoist_id FROM jd_notes WHERE id=${noteId} AND workspace_id=${wsId}`
  if (!note) return c.json({ error: 'Note introuvable' }, 404)
  if (delete_in_todoist && note.tache_todoist_id && ws?.todoist_token) {
    try {
      await fetch(`${TODOIST_API}/tasks/${note.tache_todoist_id}`, {
        method: 'DELETE', headers: todoistAuthHeader(ws.todoist_token),
      })
    } catch { /* on continue même si ça échoue */ }
  }
  await sql`UPDATE jd_notes SET tache_todoist_id=NULL, tache_todoist_due=NULL, tache_todoist_priority=NULL, tache_todoist_done=FALSE WHERE id=${noteId}`
  return c.json({ ok: true })
})

jourdoc.get('/:wsId/notes/:noteId/todoist/details', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const [ws]   = await sql`SELECT todoist_token FROM workspaces WHERE id=${wsId}`
  const [note] = await sql`SELECT tache_todoist_id FROM jd_notes WHERE id=${noteId} AND workspace_id=${wsId}`
  if (!note?.tache_todoist_id) return c.json({ error: 'Aucune tâche liée' }, 400)
  if (!ws?.todoist_token) return c.json({ error: 'Token manquant' }, 400)
  const taskId = note.tache_todoist_id
  try {
    const [taskRes, commRes] = await Promise.all([
      fetch(`${TODOIST_API}/tasks/${taskId}?include_completed=true`, { headers: todoistAuthHeader(ws.todoist_token) }),
      fetch(`${TODOIST_API}/comments?task_id=${taskId}`, { headers: todoistAuthHeader(ws.todoist_token) }),
    ])
    const task = taskRes.ok ? extractTask(await taskRes.json()) : null
    const commData = commRes.ok ? await commRes.json() : null
    const comments = Array.isArray(commData) ? commData : (commData?.results ?? [])
    return c.json({
      completed_at: task?.completed_at ?? null,
      task_content: task?.content ?? null,
      task_id:      taskId,
      comments: comments.map(cm => ({ content: cm.content, posted_at: cm.posted_at })),
    })
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

jourdoc.post('/:wsId/notes/:noteId/todoist/import', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const { completed_at, comments = [], task_title, task_id } = await c.req.json()
  const [note] = await sql`SELECT contenu, tache_todoist_recurrence_done FROM jd_notes WHERE id=${noteId} AND workspace_id=${wsId}`
  if (!note) return c.json({ error: 'Note introuvable' }, 404)

  function esc(s) {
    return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  const dateStr = completed_at
    ? new Date(completed_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  let append = `<hr><p><strong>✓ Tâche exécutée${dateStr ? ` le ${dateStr}` : ''}</strong></p>`
  if (task_title && task_id) {
    const taskUrl = `https://app.todoist.com/app/task/${esc(task_id)}`
    append += `<p>📌 <a href="${taskUrl}" target="_blank" rel="noopener noreferrer">${esc(task_title)}</a></p>`
  }
  for (const cm of comments) {
    const cmDate = cm.posted_at
      ? new Date(cm.posted_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''
    const safeContent = esc(cm.content ?? '').replace(/\n/g, '</p><p>')
    append += `<blockquote><p>${cmDate ? `<em>${cmDate}</em> — ` : ''}${safeContent}</p></blockquote>`
  }

  const newContenu = (note.contenu ?? '') + append
  if (note.tache_todoist_recurrence_done) {
    await sql`UPDATE jd_notes SET contenu=${newContenu}, tache_todoist_recurrence_done=FALSE WHERE id=${noteId}`
  } else {
    await sql`UPDATE jd_notes SET contenu=${newContenu}, tache_todoist_consigne=TRUE WHERE id=${noteId}`
  }
  return c.json({ ok: true, contenu: newContenu })
})

// ── EXPORT WORKSPACE ─────────────────────────────────────────

jourdoc.get('/:wsId/export', wsCheck, async (c) => {
  const wsId  = c.get('wsId')
  const { format = 'json', medias: withMediasParam = '0' } = c.req.query()
  const withMedias = withMediasParam === '1'

  const [objets, themes, elements, docCategories, docStatuts, rawNotes, rawMedias] = await Promise.all([
    sql`SELECT * FROM jd_objets        WHERE workspace_id=${wsId}`,
    sql`SELECT * FROM jd_themes        WHERE workspace_id=${wsId}`,
    sql`SELECT * FROM jd_elements      WHERE workspace_id=${wsId}`,
    sql`SELECT * FROM jd_doc_categorie WHERE workspace_id=${wsId}`,
    sql`SELECT * FROM jd_doc_statut    WHERE workspace_id=${wsId}`,
    sql`SELECT * FROM jd_notes         WHERE workspace_id=${wsId}`,
    sql`SELECT * FROM jd_medias        WHERE workspace_id=${wsId}`,
  ])

  const notes = await Promise.all(rawNotes.map(async n => ({
    ...n,
    objets:   await sql`SELECT o.id,o.nom FROM jd_note_objet no JOIN jd_objets o ON o.id=no.objet_id WHERE no.note_id=${n.id}`,
    themes:   await sql`SELECT t.id,t.nom FROM jd_note_theme nt JOIN jd_themes t ON t.id=nt.theme_id WHERE nt.note_id=${n.id}`,
    elements: await sql`SELECT e.id,e.nom FROM jd_note_element ne JOIN jd_elements e ON e.id=ne.element_id WHERE ne.note_id=${n.id}`,
    medias:   await sql`SELECT m.id,m.nom_original,m.fichier,m.type_media FROM jd_note_media nm JOIN jd_medias m ON m.id=nm.media_id WHERE nm.note_id=${n.id}`,
    liens:    await sql`SELECT note_cible_id,type_lien FROM jd_note_note WHERE note_source_id=${n.id}`,
  })))

  const [wsRow] = await sql`SELECT name FROM workspaces WHERE id=${wsId}`
  const wsName = wsRow?.name ?? `ws-${wsId}`
  const slug = wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const date = new Date().toISOString().slice(0, 10)

  if (format === 'json') {
    const payload = JSON.stringify({ workspace: { id: wsId, name: wsName, exported_at: new Date().toISOString() }, objets, themes, elements, doc_categories: docCategories, doc_statuts: docStatuts, notes, medias: rawMedias }, null, 2)
    c.header('Content-Type', 'application/json')
    c.header('Content-Disposition', `attachment; filename="${slug}-${date}.json"`)
    return c.body(payload)
  }

  function toCsv(rows) {
    if (!rows.length) return ''
    const keys = Object.keys(rows[0])
    const escCell = v => (v == null ? '' : /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v))
    return [keys.join(','), ...rows.map(r => keys.map(k => escCell(r[k])).join(','))].join('\n')
  }

  function makeZip(files) {
    const crcTable = (() => {
      const t = new Uint32Array(256)
      for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[i]=c }
      return t
    })()
    function crc32(buf) { let c=0xFFFFFFFF; for (const b of buf) c=(c>>>8)^crcTable[(c^b)&0xFF]; return (c^0xFFFFFFFF)>>>0 }
    const locals = []; const central = []; let off = 0
    for (const { name, data } of files) {
      const d = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
      const nb = Buffer.from(name, 'utf8')
      const crc = crc32(d); const sz = d.length
      const lh = Buffer.alloc(30 + nb.length)
      lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0,6); lh.writeUInt16LE(0,8)
      lh.writeUInt16LE(0,10); lh.writeUInt16LE(0,12); lh.writeUInt32LE(crc,14)
      lh.writeUInt32LE(sz,18); lh.writeUInt32LE(sz,22); lh.writeUInt16LE(nb.length,26); lh.writeUInt16LE(0,28)
      nb.copy(lh,30)
      const cd = Buffer.alloc(46 + nb.length)
      cd.writeUInt32LE(0x02014b50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6); cd.writeUInt16LE(0,8); cd.writeUInt16LE(0,10)
      cd.writeUInt16LE(0,12); cd.writeUInt16LE(0,14); cd.writeUInt32LE(crc,16); cd.writeUInt32LE(sz,20); cd.writeUInt32LE(sz,24)
      cd.writeUInt16LE(nb.length,28); cd.writeUInt16LE(0,30); cd.writeUInt16LE(0,32); cd.writeUInt16LE(0,34); cd.writeUInt16LE(0,36)
      cd.writeUInt32LE(0,38); cd.writeUInt32LE(off,42); nb.copy(cd,46)
      locals.push(lh,d); central.push(cd); off += 30+nb.length+sz
    }
    const cdb = Buffer.concat(central)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50,0); eocd.writeUInt16LE(0,4); eocd.writeUInt16LE(0,6)
    eocd.writeUInt16LE(files.length,8); eocd.writeUInt16LE(files.length,10)
    eocd.writeUInt32LE(cdb.length,12); eocd.writeUInt32LE(off,16); eocd.writeUInt16LE(0,20)
    return Buffer.concat([...locals, cdb, eocd])
  }

  const liens = (await Promise.all(rawNotes.map(n =>
    sql`SELECT note_source_id,note_cible_id,type_lien FROM jd_note_note WHERE note_source_id=${n.id}`
  ))).flat()

  const noteThemes = (await Promise.all(rawNotes.map(n =>
    sql`SELECT note_id,theme_id FROM jd_note_theme WHERE note_id=${n.id}`
  ))).flat()

  const noteObjets = (await Promise.all(rawNotes.map(n =>
    sql`SELECT note_id,objet_id FROM jd_note_objet WHERE note_id=${n.id}`
  ))).flat()

  const noteElements = (await Promise.all(rawNotes.map(n =>
    sql`SELECT note_id,element_id FROM jd_note_element WHERE note_id=${n.id}`
  ))).flat()

  const noteMedias = (await Promise.all(rawNotes.map(n =>
    sql`SELECT note_id,media_id FROM jd_note_media WHERE note_id=${n.id}`
  ))).flat()

  const zipFiles = [
    { name: 'objets.csv',        data: toCsv(objets) },
    { name: 'themes.csv',        data: toCsv(themes) },
    { name: 'elements.csv',      data: toCsv(elements) },
    { name: 'doc_categories.csv', data: toCsv(docCategories) },
    { name: 'doc_statuts.csv',    data: toCsv(docStatuts) },
    { name: 'notes.csv',         data: toCsv(rawNotes) },
    { name: 'note_objets.csv',   data: toCsv(noteObjets) },
    { name: 'note_themes.csv',   data: toCsv(noteThemes) },
    { name: 'note_elements.csv', data: toCsv(noteElements) },
    { name: 'medias.csv',        data: toCsv(rawMedias) },
    { name: 'note_medias.csv',   data: toCsv(noteMedias) },
    { name: 'liens_notes.csv',   data: toCsv(liens) },
  ]

  if (withMedias) {
    for (const m of rawMedias) {
      try {
        const lastSlash = m.fichier.lastIndexOf('/')
        const dir = m.fichier.substring(0, lastSlash)
        const filename = m.fichier.substring(lastSlash + 1)
        const buf = await downloadFile(dir, filename)
        zipFiles.push({ name: `medias/${m.nom_original ?? filename}`, data: buf })
      } catch { /* fichier manquant */ }
    }
  }

  const buffer = makeZip(zipFiles)
  c.header('Content-Type', 'application/zip')
  c.header('Content-Disposition', `attachment; filename="${slug}-${date}.zip"`)
  return c.body(buffer)
})

// ── ANALYSE PLURIANNUELLE ─────────────────────────────────────

jourdoc.get('/:wsId/analyse', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { objet_id, objet_dir = 'both', theme_id, theme_dir = 'both', nature } = c.req.query()

  const [wsConf] = await sql`SELECT COALESCE(jd_search_depth,3) AS d FROM workspaces WHERE id=${wsId}`
  const maxDepth = wsConf?.d ?? 3

  async function relatedIds(table, rootId, dir) {
    const all = await sql(`SELECT id, parent_id FROM ${table} WHERE workspace_id = $1`, [wsId])
    const ids = new Set([rootId])
    if (dir === 'down' || dir === 'both') {
      const dm = new Map([[rootId, 0]]); let added = true
      while (added) { added = false; for (const x of all) if (!ids.has(x.id) && ids.has(x.parent_id)) { const pd = dm.get(x.parent_id)??0; if (pd < maxDepth) { ids.add(x.id); dm.set(x.id, pd+1); added = true } } }
    }
    if (dir === 'up' || dir === 'both') {
      let cur = rootId; let d = 0
      while (d < maxDepth) { const t = all.find(x => x.id === cur); if (!t || !t.parent_id) break; ids.add(t.parent_id); cur = t.parent_id; d++ }
    }
    return ids
  }

  let query = `SELECT n.id, n.date, n.nature, n.type, n.titre_alt, n.titre,
               (SELECT nom FROM jd_themes WHERE id = n.theme_id) AS theme_nom
               FROM jd_notes n WHERE n.workspace_id = $1 AND n.date IS NOT NULL`
  const params = [wsId]; let pi = 2

  if (objet_id) {
    const ids = [...await relatedIds('jd_objets', Number(objet_id), objet_dir)]
    query += ` AND EXISTS (SELECT 1 FROM jd_note_objet no WHERE no.note_id=n.id AND no.objet_id = ANY($${pi++}))`
    params.push(ids)
  }
  if (theme_id) {
    const ids = [...await relatedIds('jd_themes', Number(theme_id), theme_dir)]
    query += ` AND EXISTS (SELECT 1 FROM jd_note_theme nt WHERE nt.note_id=n.id AND nt.theme_id = ANY($${pi++}))`
    params.push(ids)
  }
  if (nature && nature !== 'both') {
    query += ` AND n.nature = $${pi++}`; params.push(nature)
  } else {
    query += ` AND n.nature IS NOT NULL`
  }
  query += ` ORDER BY n.date ASC`

  const notes = await sql(query, params)
  return c.json({ notes: notes.map(normalizeNote) })
})

export default jourdoc
