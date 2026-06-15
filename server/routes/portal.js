import { Hono } from 'hono'
import sql from '../../db/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const portal = new Hono()

portal.use('*', authMiddleware)

portal.get('/apps', async (c) => {
  const userId = c.get('userId')
  const [user] = await sql`SELECT id, username, email FROM users WHERE id = ${userId}`
  const apps = await sql`
    SELECT a.slug, a.name, a.icon, a.description
    FROM apps a
    JOIN user_app_access uaa ON uaa.app_id = a.id
    WHERE uaa.user_id = ${userId} AND a.is_active = TRUE
  `
  return c.json({ user, apps })
})

portal.get('/apps/:slug/workspaces', async (c) => {
  const userId = c.get('userId')
  const { slug } = c.req.param()
  const [app] = await sql`SELECT id FROM apps WHERE slug = ${slug} AND is_active = TRUE`
  if (!app) return c.json({ error: 'Not found' }, 404)
  const [hasAccess] = await sql`SELECT 1 FROM user_app_access WHERE user_id = ${userId} AND app_id = ${app.id}`
  if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)
  const workspaces = await sql`
    SELECT w.id, w.name, uwa.role
    FROM workspaces w
    JOIN user_workspace_access uwa ON uwa.workspace_id = w.id
    WHERE uwa.user_id = ${userId} AND w.app_id = ${app.id}
  `
  return c.json({ workspaces })
})

export default portal
