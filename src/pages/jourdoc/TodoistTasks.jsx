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

function TaskRow({ task, onImport, onFollowUp, importing }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const goNote = () => navigate(`/jourdoc/${wsId}/notes/${task.note_id}`)

  return (
    <div className="todoist-task-row">
      <div className="todoist-task-row__body">
        <div className="todoist-task-row__head">
          {task.recurrence_done && <span style={{ fontSize: '1rem', flexShrink: 0 }} title="Tâche récurrente">🔄</span>}
          {/* Libellé = contenu de la TÂCHE */}
          <p className="jd-note-card__titre" style={{ cursor: 'pointer', margin: 0, flex: 1 }} onClick={goNote}>
            {task.content ?? task.note_titre}
          </p>
          {task.consigne && <span className="todoist-task-row__badge todoist-task-row__badge--done">✓ consigné</span>}
        </div>

        {/* Contexte : note + thèmes + objets */}
        <div className="todoist-task-row__context">
          <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
            📔 {task.note_titre_alt ?? task.note_titre}
          </span>
          {task.themes?.length > 0
            ? task.themes.map(t => <span key={t.id} className="jd-note-card__theme">{t.nom}</span>)
            : task.theme_nom && <span className="jd-note-card__theme">{task.theme_nom}</span>}
          {task.objets?.length > 0 && (
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              🌿 {task.objets.map(o => o.nom).join(', ')}
            </span>
          )}
        </div>

        {/* Meta : date note + priorité + échéance */}
        <div className="todoist-task-row__meta">
          {task.note_date && <span className="todoist-task-row__date">{fmtDate(task.note_date)}</span>}
          {task.priority && (
            <span className="todoist-task-row__prio" style={{ color: PRIO_COLOR[task.priority] }}>
              {PRIO_LABEL[task.priority]}
            </span>
          )}
          {task.due && (
            <span className="todoist-task-row__due">
              {task.recurrence_done ? '🔄' : '📅'} {fmtDate(task.due)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="todoist-task-row__actions">
        {(task.done || task.recurrence_done) && !task.consigne && (
          <>
            <button className="btn btn-secondary" style={{ fontSize: '.78rem', padding: '.3rem .6rem' }}
              onClick={() => onImport(task)} disabled={importing === task.id}>
              {importing === task.id ? '…' : '↓ Consigner'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '.3rem .6rem' }}
              onClick={() => onFollowUp(task)}>✎ Suivi</button>
          </>
        )}
        <button className="btn btn-ghost" style={{ fontSize: '.78rem', padding: '.3rem .6rem' }} onClick={goNote}>→</button>
      </div>
    </div>
  )
}

export default function TodoistTasks() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate  = useNavigate()

  const [tasks, setTasks]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [importing, setImporting] = useState(null)
  const [msg, setMsg]             = useState('')

  function load() {
    setLoading(true)
    fetch(API_ROUTES.JD_WS_TODOIST_TASKS(wsId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setMsg(`Erreur API : ${d.error}`); return }
        setTasks(d.tasks ?? [])
      })
      .catch(e => setMsg(`Erreur réseau : ${e.message}`))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [wsId, token])

  // Déjà triées par urgence décroissante côté serveur.
  const toHandle = tasks.filter(t => (t.done && !t.consigne) || t.recurrence_done)
  const active   = tasks.filter(t => !t.done && !t.recurrence_done)
  const done     = tasks.filter(t => t.done && t.consigne)

  async function handleImport(task) {
    setImporting(task.id); setMsg('')
    const base = API_ROUTES.JD_NOTE_TODOIST(wsId, task.note_id)
    try {
      const details = await fetch(`${base}/${task.id}/details`, { headers: authHeader(token) }).then(r => r.json())
      if (details.error) { setMsg(`Erreur : ${details.error}`); return }
      const res = await fetch(`${base}/${task.id}/import`, {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ completed_at: details.completed_at, comments: details.comments, task_title: details.task_content, task_id: details.task_id }),
      })
      if (res.ok) {
        setMsg(`Résolution consignée dans « ${task.note_titre_alt ?? task.note_titre} ».`)
        load()
      } else {
        const e = await res.json().catch(() => ({}))
        setMsg(`Erreur : ${e.error ?? res.status}`)
      }
    } catch (e) { setMsg(`Erreur : ${e.message}`) }
    finally { setImporting(null) }
  }

  function handleFollowUp(task) {
    const titre = task.note_titre_alt ?? task.note_titre
    navigate(`/jourdoc/${wsId}/new`, {
      state: {
        objet_ids: task.objets?.map(o => o.id) ?? [],
        titre: `Suivi — ${task.content ?? titre}`,
        contenu: `<p>Note d'origine : <a href="/jourdoc/${wsId}/notes/${task.note_id}">${titre}</a></p>`,
      },
    })
  }

  function Section({ title, items }) {
    if (items.length === 0) return null
    return (
      <section className="todoist-tasks-section">
        <h3 className="todoist-tasks-section__title">{title} ({items.length})</h3>
        {items.map(t => (
          <TaskRow key={t.id} task={t} onImport={handleImport} onFollowUp={handleFollowUp} importing={importing} />
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
      ) : tasks.length === 0 ? (
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
