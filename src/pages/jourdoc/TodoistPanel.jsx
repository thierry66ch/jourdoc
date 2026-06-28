import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

const MAX_TASKS = 10

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
  const base = API_ROUTES.JD_NOTE_TODOIST(wsId, note.id)

  const [data, setData]         = useState(null)   // { configured, tasks } | null
  const [refreshing, setRefreshing] = useState(false)
  const [working, setWorking]   = useState(false)
  const [err, setErr]           = useState('')
  const [detailsCache, setDetailsCache] = useState({})

  // Formulaire d'ajout : null | 'create' | 'link'
  const [adding, setAdding]     = useState(null)
  const [form, setForm]         = useState({ titre: '', due_date: '', priority: 2, recurrence: '' })
  const [showHelp, setShowHelp] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [linkUrl, setLinkUrl]   = useState('')
  const [linkErr, setLinkErr]   = useState('')

  const load = useCallback(async () => {
    try {
      const d = await fetch(base, { headers: authHeader(token) }).then(r => r.json())
      setData({ configured: d.configured, tasks: d.tasks || [] })
    } catch {
      setData({ configured: true, tasks: [], error: 'Erreur réseau' })
    }
  }, [base, token])

  useEffect(() => { load() }, [load])

  async function refresh() { setRefreshing(true); try { await load() } finally { setRefreshing(false) } }

  async function closeTask(task) {
    if (!confirm('Marquer cette tâche comme terminée dans Todoist ?')) return
    setWorking(true); setErr('')
    try {
      const res = await fetch(`${base}/${task.id}/close`, { method: 'POST', headers: authHeader(token) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? `Erreur ${res.status}`) }
      await load(); onNoteUpdated?.()
    } finally { setWorking(false) }
  }

  async function unlink(task, deleteInTodoist) {
    if (!confirm(deleteInTodoist ? 'Supprimer aussi la tâche dans Todoist ?' : 'Délier la tâche ?')) return
    setWorking(true); setErr('')
    try {
      await fetch(`${base}/${task.id}`, {
        method: 'DELETE', headers: authHeader(token),
        body: JSON.stringify({ delete_in_todoist: deleteInTodoist }),
      })
      await load(); onNoteUpdated?.()
    } finally { setWorking(false) }
  }

  async function fetchDetails(task) {
    if (detailsCache[task.id]) return detailsCache[task.id]
    const d = await fetch(`${base}/${task.id}/details`, { headers: authHeader(token) }).then(r => r.json())
    setDetailsCache(c => ({ ...c, [task.id]: d }))
    return d
  }

  async function importToNote(task) {
    setWorking(true); setErr('')
    try {
      const d = await fetchDetails(task)
      if (!d || d.error) { setErr(d?.error ?? 'Erreur'); return }
      const res = await fetch(`${base}/${task.id}/import`, {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ completed_at: d.completed_at, comments: d.comments, task_title: d.task_content, task_id: d.task_id }),
      })
      if (res.ok) { onNoteUpdated?.(); await load() }
      else { const e = await res.json().catch(() => ({})); setErr(e.error ?? 'Erreur') }
    } finally { setWorking(false) }
  }

  async function createFollowUp(task) {
    setWorking(true); setErr('')
    try {
      const d = await fetchDetails(task)
      if (!d || d.error) { setErr(d?.error ?? 'Erreur'); return }
      const execDate = d.completed_at ? d.completed_at.slice(0, 10) : null
      let contenu = ''
      if (d.completed_at) {
        const ds = new Date(d.completed_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
        contenu += `<p><strong>Exécuté le ${ds}</strong></p>`
      }
      for (const cm of d.comments) {
        const cmDate = cm.posted_at ? new Date(cm.posted_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
        contenu += `<blockquote><p>${cmDate ? `<em>${cmDate}</em> — ` : ''}${(cm.content ?? '').replace(/\n/g, '</p><p>')}</p></blockquote>`
      }
      navigate(`/jourdoc/${wsId}/new`, {
        state: {
          type: 'journal', nature: 'activite', note_date: execDate,
          objet_ids: (note.objets ?? []).map(o => o.id), contenu,
          pending_links: [{ id: note.id, titre: note.titre, type: note.type, nature: note.nature, date: note.date }],
        },
      })
    } finally { setWorking(false) }
  }

  async function createTask(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch(base, {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({
          titre: form.titre || undefined, due_date: form.due_date || undefined,
          priority: form.priority, recurrence: form.recurrence || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Erreur'); return }
      setAdding(null); setForm({ titre: '', due_date: '', priority: 2, recurrence: '' })
      await load(); onNoteUpdated?.()
    } catch { setErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function linkTask() {
    setSaving(true); setLinkErr('')
    try {
      const res = await fetch(API_ROUTES.JD_NOTE_TODOIST_LINK(wsId, note.id), {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ task_url: linkUrl }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { setLinkErr(d.error ?? 'Erreur'); return }
      setAdding(null); setLinkUrl('')
      await load(); onNoteUpdated?.()
    } catch (e) { setLinkErr(`Erreur réseau : ${e.message}`) }
    finally { setSaving(false) }
  }

  // ── Chargement ──
  if (data === null) return (
    <div className="todoist-panel todoist-panel--loading">
      <span className="todoist-logo">✓</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Chargement…</span>
    </div>
  )

  const tasks = data.tasks
  const open = tasks.filter(t => !t.done).length

  return (
    <div className="todoist-panel">
      <div className="todoist-panel__header">
        <span className="todoist-logo">✓</span>
        <span className="todoist-panel__title">Tâches Todoist</span>
        {tasks.length > 0 && (
          <span className="todoist-badge todoist-badge--open">
            {open > 0 ? `${open} en cours` : 'Toutes terminées'}{tasks.length > open ? ` · ${tasks.length - open} ✓` : ''}
          </span>
        )}
        <button className="todoist-refresh-btn" onClick={refresh} disabled={refreshing} title="Rafraîchir">
          {refreshing ? '…' : '↺'}
        </button>
      </div>

      {!data.configured && (
        <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: 0 }}>
          Todoist non configuré pour ce workspace (⚙️ Réglages).
        </p>
      )}
      {err && <p style={{ color: 'var(--danger)', fontSize: '.8rem' }}>{err}</p>}

      {/* Liste des tâches */}
      {tasks.map(task => {
        const prio = priorityInfo(task.priority)
        return (
          <div key={task.id} className="todoist-task-row">
            <div className="todoist-task-head">
              {task.done
                ? <span className="todoist-badge todoist-badge--done">Terminée ✓</span>
                : <span className="todoist-badge todoist-badge--open">En cours</span>}
              <span className="todoist-task-content">{task.content ?? note.titre}</span>
            </div>

            <div className="todoist-task-meta">
              {prio && (
                <span className="todoist-prio-chip" style={{ '--prio-color': prio.color }}>
                  {prio.label.split(' — ')[0]}
                </span>
              )}
              {task.due && <span className="todoist-task-due">📅 {task.due}{task.recurrence_done ? ' 🔁' : ''}</span>}
              {task.url && <a href={task.url} target="_blank" rel="noopener noreferrer" className="todoist-link">↗</a>}
            </div>

            <div className="todoist-panel__actions">
              {!task.done && (
                <button className="btn btn-primary" style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
                  onClick={() => closeTask(task)} disabled={working}>✓ Terminer</button>
              )}
              {task.done && !task.consigne && (
                <button className="btn btn-secondary" style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
                  onClick={() => importToNote(task)} disabled={working}
                  title="Ajoute la date d'exécution et les commentaires Todoist à la fin de cette note">
                  ↓ Importer dans la note
                </button>
              )}
              {task.done && (
                <button className="btn btn-secondary" style={{ fontSize: '.75rem', padding: '.25rem .6rem' }}
                  onClick={() => createFollowUp(task)} disabled={working}
                  title="Crée une note de suivi pré-remplie">→ Note de suivi</button>
              )}
              <button className="btn btn-ghost" style={{ fontSize: '.75rem', padding: '.25rem .5rem' }}
                onClick={() => unlink(task, false)} disabled={working}>Délier</button>
              <button className="btn btn-danger" style={{ fontSize: '.75rem', padding: '.25rem .5rem' }}
                onClick={() => unlink(task, true)} disabled={working}>Supprimer</button>
            </div>
          </div>
        )
      })}

      {tasks.length === 0 && data.configured && (
        <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '.25rem 0' }}>Aucune tâche liée.</p>
      )}

      {/* Ajout */}
      {data.configured && adding === null && tasks.length < MAX_TASKS && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.375rem', marginTop: '.5rem' }}>
          <button className="btn btn-secondary" style={{ fontSize: '.8125rem', width: '100%' }}
            onClick={() => { setAdding('create'); setErr('') }}>+ Ajouter une tâche</button>
          <button className="btn btn-ghost" style={{ fontSize: '.8125rem', width: '100%' }}
            onClick={() => { setAdding('link'); setLinkErr('') }}>🔗 Lier une tâche existante</button>
        </div>
      )}

      {tasks.length >= MAX_TASKS && (
        <p style={{ color: 'var(--text-muted)', fontSize: '.75rem', marginTop: '.5rem' }}>
          Maximum {MAX_TASKS} tâches par note.
        </p>
      )}

      {adding === 'link' && (
        <div className="todoist-form">
          {linkErr && <p style={{ color: 'var(--danger)', fontSize: '.8rem', margin: '0 0 .5rem' }}>{linkErr}</p>}
          <div className="todoist-form__row">
            <label className="todoist-form__label">URL ou ID de la tâche Todoist</label>
            <input className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              placeholder="https://app.todoist.com/app/task/… ou ID"
              value={linkUrl} onChange={e => setLinkUrl(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
            <button className="btn btn-primary" style={{ fontSize: '.8125rem', flex: 1 }}
              disabled={saving || !linkUrl.trim()} onClick={linkTask}>{saving ? '…' : 'Lier'}</button>
            <button className="btn btn-ghost" style={{ fontSize: '.8125rem' }}
              onClick={() => { setAdding(null); setLinkUrl('') }}>Annuler</button>
          </div>
        </div>
      )}

      {adding === 'create' && (
        <form onSubmit={createTask} className="todoist-form">
          {err && <p style={{ color: 'var(--danger)', fontSize: '.8rem', margin: '0 0 .5rem' }}>{err}</p>}

          <div className="todoist-form__row">
            <label className="todoist-form__label">Titre de la tâche</label>
            <input className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
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
              <button type="button" className="todoist-help-btn" onClick={() => setShowHelp(h => !h)} title="Aide syntaxe">?</button>
            </div>
            <input className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              placeholder="ex : every monday, every 2 weeks…"
              value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} />
            {showHelp && (
              <div className="todoist-help-popup">
                <p style={{ fontWeight: 600, marginBottom: '.375rem', fontSize: '.8rem' }}>Syntaxe Todoist (anglais)</p>
                {RECURRENCE_HELP.map(([en, fr]) => (
                  <div key={en} className="todoist-help-row">
                    <code className="todoist-help-code" onClick={() => { setForm(f => ({ ...f, recurrence: en })); setShowHelp(false) }}>{en}</code>
                    <span>{fr}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
            <button type="submit" className="btn btn-primary" style={{ fontSize: '.8125rem', flex: 1 }} disabled={saving}>
              {saving ? '…' : 'Créer la tâche'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '.8125rem' }} onClick={() => setAdding(null)}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  )
}
