import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

const PRIORITY_OPTIONS = [
  { value: 4, label: 'P1 — Urgente', color: '#db4035' },
  { value: 3, label: 'P2 — Haute',   color: '#ff9933' },
  { value: 2, label: 'P3 — Normale', color: '#4073ff' },
  { value: 1, label: 'P4 — Basse',   color: '#aaa' },
]

const RECURRENCE_HELP = [
  ['every day',       'Chaque jour'],
  ['every weekday',   'Chaque jour ouvrable'],
  ['every week',      'Chaque semaine'],
  ['every monday',    'Chaque lundi'],
  ['every 2 weeks',   'Toutes les 2 semaines'],
  ['every month',     'Chaque mois'],
  ['every 3 months',  'Tous les 3 mois'],
]

function priorityInfo(value) {
  return PRIORITY_OPTIONS.find(p => p.value === value) ?? null
}

export default function TodoistPanel({ wsId, token, note, onNoteUpdated }) {
  const navigate = useNavigate()
  const { wsId: wsIdParam } = useParams()
  const [status, setStatus]         = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [form, setForm]             = useState({ titre: note?.titre ?? '', due_date: '', priority: 2, recurrence: '' })
  const [saving, setSaving]         = useState(false)
  const [closing, setClosing]       = useState(false)
  const [showHelp, setShowHelp]     = useState(false)
  const [err, setErr]               = useState('')
  const [details, setDetails]       = useState(null)   // { completed_at, comments }
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [importing, setImporting]   = useState(false)
  const [linking, setLinking]       = useState(false)
  const [linkUrl, setLinkUrl]       = useState('')
  const [linkErr, setLinkErr]       = useState('')
  const [linkSaving, setLinkSaving] = useState(false)

  const poll = useCallback(() => {
    if (!note?.tache_todoist_id) { setStatus({ linked: false }); return }
    fetch(API_ROUTES.JD_NOTE_TODOIST(wsId, note.id), { headers: authHeader(token) })
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ linked: true, error: 'Erreur réseau' }))
  }, [note?.id, note?.tache_todoist_id, wsId, token])

  // Poll à l'ouverture de la note
  useEffect(() => { poll() }, [poll])

  async function refresh() {
    setRefreshing(true)
    try {
      const data = await fetch(API_ROUTES.JD_NOTE_TODOIST(wsId, note.id), { headers: authHeader(token) }).then(r => r.json())
      setStatus(data)
    } finally { setRefreshing(false) }
  }

  async function closeTask() {
    if (!confirm('Marquer cette tâche comme terminée dans Todoist ?')) return
    setClosing(true)
    try {
      const res = await fetch(API_ROUTES.JD_NOTE_TODOIST_CLOSE(wsId, note.id), {
        method: 'POST', headers: authHeader(token),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus(s => ({ ...s, completed: true }))
      } else {
        setStatus(s => ({ ...s, error: data.error ?? `Erreur ${res.status}` }))
      }
    } catch (e) {
      setStatus(s => ({ ...s, error: e.message }))
    } finally { setClosing(false) }
  }

  async function createTask(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch(API_ROUTES.JD_NOTE_TODOIST(wsId, note.id), {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({
          titre:      form.titre      || undefined,
          due_date:   form.due_date   || undefined,
          priority:   form.priority,
          recurrence: form.recurrence || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Erreur'); return }
      setStatus({ linked: true, completed: false, url: data.url, task_id: data.task_id,
        content: form.titre || note.titre, priority: form.priority })
      setCreating(false)
    } catch { setErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function fetchDetails() {
    if (details) return details
    setLoadingDetails(true)
    try {
      const d = await fetch(API_ROUTES.JD_NOTE_TODOIST_DETAILS(wsId, note.id), { headers: authHeader(token) }).then(r => r.json())
      setDetails(d)
      return d
    } finally { setLoadingDetails(false) }
  }

  async function importToNote() {
    const d = await fetchDetails()
    if (!d || d.error) { setStatus(s => ({ ...s, error: d?.error ?? 'Erreur' })); return }
    setImporting(true)
    try {
      const res = await fetch(API_ROUTES.JD_NOTE_TODOIST_IMPORT(wsId, note.id), {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ completed_at: d.completed_at, comments: d.comments, task_title: d.task_content, task_id: d.task_id }),
      })
      if (res.ok) {
        setStatus(s => ({ ...s, _imported: true }))
        onNoteUpdated?.()
      }
    } finally { setImporting(false) }
  }

  async function createFollowUp() {
    const d = await fetchDetails()
    if (!d || d.error) { setStatus(s => ({ ...s, error: d?.error ?? 'Erreur' })); return }
    // Date d'exécution
    const execDate = d.completed_at ? d.completed_at.slice(0, 10) : null
    // Contenu pré-rempli avec les commentaires
    let contenu = ''
    if (d.completed_at) {
      const dateStr = new Date(d.completed_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
      contenu += `<p><strong>Exécuté le ${dateStr}</strong></p>`
    }
    for (const cm of d.comments) {
      const cmDate = cm.posted_at
        ? new Date(cm.posted_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
        : ''
      contenu += `<blockquote><p>${cmDate ? `<em>${cmDate}</em> — ` : ''}${(cm.content ?? '').replace(/\n/g, '</p><p>')}</p></blockquote>`
    }
    navigate(`/jourdoc/${wsId}/new`, {
      state: {
        type:    'journal',
        nature:  'activite',
        note_date: execDate,
        objet_ids: (note.objets ?? []).map(o => o.id),
        contenu,
        pending_links: [{
          id: note.id, titre: note.titre,
          type: note.type, nature: note.nature, date: note.date,
        }],
      }
    })
  }

  async function unlink(deleteInTodoist) {
    if (!confirm(deleteInTodoist ? 'Supprimer aussi la tâche dans Todoist ?' : 'Délier la tâche ?')) return
    await fetch(API_ROUTES.JD_NOTE_TODOIST(wsId, note.id), {
      method: 'DELETE', headers: authHeader(token),
      body: JSON.stringify({ delete_in_todoist: deleteInTodoist }),
    })
    setStatus({ linked: false })
  }

  // ── Chargement initial ──
  if (status === null) return (
    <div className="todoist-panel todoist-panel--loading">
      <span className="todoist-logo">✓</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Chargement…</span>
    </div>
  )

  // ── Tâche liée ──
  if (status.linked) {
    const prio = priorityInfo(status.priority)
    return (
      <div className="todoist-panel">
        <div className="todoist-panel__header">
          <span className="todoist-logo">✓</span>
          <span className="todoist-panel__title">Tâche Todoist</span>
          {status.completed
            ? <span className="todoist-badge todoist-badge--done">Terminée ✓</span>
            : <span className="todoist-badge todoist-badge--open">En cours</span>
          }
          <button className="todoist-refresh-btn" onClick={refresh} disabled={refreshing}
            title="Rafraîchir le statut">
            {refreshing ? '…' : '↺'}
          </button>
        </div>

        {status.error ? (
          <p style={{ color: 'var(--danger)', fontSize: '.8rem' }}>{status.error}</p>
        ) : (
          <>
            <p className="todoist-task-content">{status.content ?? note.titre}</p>

            <div className="todoist-task-meta">
              {prio && (
                <span className="todoist-prio-chip" style={{ '--prio-color': prio.color }}>
                  {prio.label.split(' — ')[0]}
                </span>
              )}
              {status.due && (
                <span className="todoist-task-due">
                  📅 {status.due.date ?? status.due.string}
                  {status.due.is_recurring && ' 🔁'}
                </span>
              )}
            </div>

            {status.url && (
              <a href={status.url} target="_blank" rel="noopener noreferrer"
                className="todoist-link">
                Ouvrir dans Todoist ↗
              </a>
            )}
          </>
        )}

        <div className="todoist-panel__actions">
          {!status.completed && (
            <button className="btn btn-primary" style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
              onClick={closeTask} disabled={closing}>
              {closing ? '…' : '✓ Terminer'}
            </button>
          )}
          {status.completed && !status._imported && (
            <button className="btn btn-secondary" style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
              onClick={importToNote} disabled={importing || loadingDetails}
              title="Ajoute la date d'exécution et les commentaires Todoist à la fin de cette note">
              {importing || loadingDetails ? '…' : '↓ Importer dans la note'}
            </button>
          )}
          {status.completed && (
            <button className="btn btn-secondary" style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
              onClick={createFollowUp} disabled={loadingDetails}
              title="Crée une note de suivi pré-remplie avec la date d'exécution et les commentaires">
              {loadingDetails ? '…' : '→ Note de suivi'}
            </button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: '.75rem', padding: '.25rem .5rem' }}
            onClick={() => unlink(false)}>Délier</button>
          <button className="btn btn-danger" style={{ fontSize: '.75rem', padding: '.25rem .5rem' }}
            onClick={() => unlink(true)}>Supprimer</button>
        </div>
      </div>
    )
  }

  // ── Pas de tâche ──
  return (
    <div className="todoist-panel">
      <div className="todoist-panel__header">
        <span className="todoist-logo">✓</span>
        <span className="todoist-panel__title">Todoist</span>
      </div>

      {!creating && !linking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
          <button className="btn btn-secondary" style={{ fontSize: '.8125rem', width: '100%' }}
            onClick={() => setCreating(true)}>
            + Créer une tâche
          </button>
          <button className="btn btn-ghost" style={{ fontSize: '.8125rem', width: '100%' }}
            onClick={() => { setLinking(true); setLinkErr('') }}>
            🔗 Lier une tâche existante
          </button>
        </div>
      )}

      {linking && (
        <div className="todoist-form">
          {linkErr && <p style={{ color: 'var(--danger)', fontSize: '.8rem', margin: '0 0 .5rem' }}>{linkErr}</p>}
          <div className="todoist-form__row">
            <label className="todoist-form__label">URL ou ID de la tâche Todoist</label>
            <input className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              placeholder="https://app.todoist.com/app/task/… ou ID"
              value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              autoFocus />
          </div>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
            <button className="btn btn-primary" style={{ fontSize: '.8125rem', flex: 1 }}
              disabled={linkSaving || !linkUrl.trim()}
              onClick={async () => {
                setLinkSaving(true); setLinkErr('')
                try {
                  const res = await fetch(API_ROUTES.JD_NOTE_TODOIST_LINK(wsId, note.id), {
                    method: 'POST', headers: authHeader(token),
                    body: JSON.stringify({ task_url: linkUrl }),
                  })
                  const data = await res.json()
                  if (!res.ok || !data.ok) { setLinkErr(data.error ?? 'Erreur'); return }
                  setLinking(false); setLinkUrl('')
                  setStatus({ linked: true, completed: false, url: data.url, task_id: data.task_id, content: data.content })
                } catch (e) { setLinkErr(`Erreur réseau : ${e.message}`) }
                finally { setLinkSaving(false) }
              }}>
              {linkSaving ? '…' : 'Lier'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: '.8125rem' }}
              onClick={() => { setLinking(false); setLinkUrl('') }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {creating && (
        <form onSubmit={createTask} className="todoist-form">
          {err && <p style={{ color: 'var(--danger)', fontSize: '.8rem', margin: '0 0 .5rem' }}>{err}</p>}

          <div className="todoist-form__row">
            <label className="todoist-form__label">Titre de la tâche</label>
            <input className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              value={form.titre}
              onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
              placeholder={note?.titre} />
          </div>

          <div className="todoist-form__row">
            <label className="todoist-form__label">Échéance</label>
            <input type="date" className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>

          <div className="todoist-form__row">
            <label className="todoist-form__label">Priorité</label>
            <div className="todoist-priority-group">
              {PRIORITY_OPTIONS.map(p => (
                <button key={p.value} type="button"
                  className={`todoist-prio-btn${form.priority === p.value ? ' active' : ''}`}
                  style={{ '--prio-color': p.color }}
                  onClick={() => setForm(f => ({ ...f, priority: p.value }))}>
                  {p.label.split(' — ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="todoist-form__row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem' }}>
              <label className="todoist-form__label">Récurrence</label>
              <button type="button" className="todoist-help-btn"
                onClick={() => setShowHelp(h => !h)} title="Aide syntaxe">?</button>
            </div>
            <input className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              placeholder="ex : every monday, every 2 weeks…"
              value={form.recurrence}
              onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} />
            {showHelp && (
              <div className="todoist-help-popup">
                <p style={{ fontWeight: 600, marginBottom: '.375rem', fontSize: '.8rem' }}>Syntaxe Todoist (anglais)</p>
                {RECURRENCE_HELP.map(([en, fr]) => (
                  <div key={en} className="todoist-help-row">
                    <code className="todoist-help-code"
                      onClick={() => { setForm(f => ({ ...f, recurrence: en })); setShowHelp(false) }}>
                      {en}
                    </code>
                    <span>{fr}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
            <button type="submit" className="btn btn-primary"
              style={{ fontSize: '.8125rem', flex: 1 }} disabled={saving}>
              {saving ? '…' : 'Créer la tâche'}
            </button>
            <button type="button" className="btn btn-ghost"
              style={{ fontSize: '.8125rem' }} onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
