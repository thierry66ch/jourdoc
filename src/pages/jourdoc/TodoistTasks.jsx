import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

const PRIO_LABEL = { 4: 'P1', 3: 'P2', 2: 'P3', 1: 'P4' }
const PRIO_COLOR = { 4: '#db4035', 3: '#ff9933', 2: '#4073ff', 1: '#aaa' }

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function NoteRow({ note, onImport, onFollowUp, importing }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const isRecurring = note.tache_todoist_recurrence_done === 1
  const isDone      = note.tache_todoist_done === 1
  const isConsigne  = note.tache_todoist_consigne === 1

  return (
    <div className="todoist-task-row">
      {/* Titre de la note — plein titre pour le contexte complet */}
      <div className="todoist-task-row__body">
        <div className="todoist-task-row__head">
          {isRecurring && <span style={{ fontSize: '1rem', flexShrink: 0 }} title="Tâche récurrente">🔄</span>}
          <p className="jd-note-card__titre"
            style={{ cursor: 'pointer', margin: 0, flex: 1 }}
            onClick={() => navigate(`/jourdoc/${wsId}/notes/${note.id}`)}>
            {note.tache_todoist_content ?? note.titre}
          </p>
          {isConsigne && <span className="todoist-task-row__badge todoist-task-row__badge--done">✓ consigné</span>}
        </div>

        {/* Contexte : thèmes + objets */}
        {(note.themes?.length > 0 || note.theme_nom || note.objets?.length > 0) && (
          <div className="todoist-task-row__context">
            {note.themes?.length > 0
              ? note.themes.map(t => <span key={t.id} className="jd-note-card__theme">{t.nom}</span>)
              : note.theme_nom && <span className="jd-note-card__theme">{note.theme_nom}</span>}
            {note.objets?.length > 0 && (
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                🌿 {note.objets.map(o => o.nom).join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Meta : date note + priorité + échéance */}
        <div className="todoist-task-row__meta">
          {note.date && <span className="todoist-task-row__date">{fmtDate(note.date)}</span>}
          {note.tache_todoist_priority && (
            <span className="todoist-task-row__prio" style={{ color: PRIO_COLOR[note.tache_todoist_priority] }}>
              {PRIO_LABEL[note.tache_todoist_priority]}
            </span>
          )}
          {note.tache_todoist_due && (
            <span className="todoist-task-row__due">
              {isRecurring ? '🔄' : '📅'} {fmtDate(note.tache_todoist_due)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="todoist-task-row__actions">
        {(isDone || isRecurring) && !isConsigne && (
          <>
            <button className="btn btn-secondary" style={{ fontSize: '.78rem', padding: '.3rem .6rem' }}
              onClick={() => onImport(note)} disabled={importing === note.id}>
              {importing === note.id ? '…' : '↓ Consigner'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '.3rem .6rem' }}
              onClick={() => onFollowUp(note)}>
              ✎ Suivi
            </button>
          </>
        )}
        <button className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '.3rem .6rem' }}
          onClick={() => navigate(`/jourdoc/${wsId}/notes/${note.id}`)}>
          →
        </button>
      </div>
    </div>
  )
}

export default function TodoistTasks() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate  = useNavigate()

  const [notes, setNotes]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [importing, setImporting] = useState(null)
  const [msg, setMsg]             = useState('')

  function load() {
    setLoading(true)
    fetch(API_ROUTES.JD_WS_TODOIST_TASKS(wsId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setMsg(`Erreur API : ${d.error}`); return }
        setNotes(d.notes ?? [])
      })
      .catch(e => setMsg(`Erreur réseau : ${e.message}`))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [wsId, token])

  // À traiter : terminées non consignées + récurrentes exécutées
  const toHandle = notes.filter(n =>
    (n.tache_todoist_done && !n.tache_todoist_consigne) || n.tache_todoist_recurrence_done
  )
  // En cours : actives
  const active  = notes.filter(n => !n.tache_todoist_done && !n.tache_todoist_recurrence_done)
  // Traités : consignées
  const done    = notes.filter(n => n.tache_todoist_done && n.tache_todoist_consigne)

  async function handleImport(note) {
    setImporting(note.id); setMsg('')
    try {
      const details = await fetch(API_ROUTES.JD_NOTE_TODOIST_DETAILS(wsId, note.id), { headers: authHeader(token) }).then(r => r.json())
      if (details.error) { setMsg(`Erreur : ${details.error}`); return }
      const res = await fetch(API_ROUTES.JD_NOTE_TODOIST_IMPORT(wsId, note.id), {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ completed_at: details.completed_at, comments: details.comments, task_title: details.task_content, task_id: details.task_id }),
      })
      if (res.ok) {
        setMsg(`Résolution consignée dans "${note.titre_alt ?? note.titre}".`)
        load()
      }
    } catch (e) { setMsg(`Erreur : ${e.message}`) }
    finally { setImporting(null) }
  }

  function handleFollowUp(note) {
    const titre = note.titre_alt ?? note.titre
    navigate(`/jourdoc/${wsId}/new`, {
      state: {
        objet_ids: note.objets?.map(o => o.id) ?? [],
        titre: `Suivi — ${titre}`,
        contenu: `<p>Note d'origine : <a href="/jourdoc/${wsId}/notes/${note.id}">${titre}</a></p>`,
      }
    })
  }

  function Section({ title, items }) {
    if (items.length === 0) return null
    return (
      <section className="todoist-tasks-section">
        <h3 className="todoist-tasks-section__title">{title} ({items.length})</h3>
        {items.map(n => (
          <NoteRow key={n.id} note={n} onImport={handleImport} onFollowUp={handleFollowUp} importing={importing} />
        ))}
      </section>
    )
  }

  return (
    <div className="jd-objet-detail">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <h2 style={{ flex: 1 }}>✓ Tâches Todoist</h2>
        <button className="btn btn-secondary" style={{ fontSize: '.8rem', padding: '.35rem .7rem' }}
          onClick={load}>🔄 Rafraîchir</button>
      </div>

      {msg && <p style={{ fontSize: '.875rem', color: 'var(--success)', padding: '.5rem 0' }}>{msg}</p>}

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : notes.length === 0 ? (
        <div className="empty-state"><div className="empty-state__icon">✓</div><p>Aucune tâche Todoist liée.</p></div>
      ) : (
        <>
          <Section title="🔔 À traiter" items={toHandle} />
          <Section title="⏳ En cours"  items={active} />
          <Section title="✅ Traités"   items={done} />
        </>
      )}
    </div>
  )
}
