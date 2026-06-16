import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import sql from '../../db/db.js'
import { adminMiddleware } from '../middleware/adminMiddleware.js'

const admin = new Hono()

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function sendOtpEmail(to, otp) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'Code OTP — JourDoc admin',
    text: `Votre code OTP : ${otp}\n\nValide 10 minutes.`,
  })
}

admin.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  const [adminUser] = await sql`SELECT * FROM admin WHERE email = ${email}`
  if (!adminUser) return c.json({ error: 'Invalid credentials' }, 401)
  const valid = await bcrypt.compare(password, adminUser.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)
  const otp = generateOtp()
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await sql`UPDATE admin SET otp_code = ${otp}, otp_expires = ${expires} WHERE id = ${adminUser.id}`
  try {
    await sendOtpEmail(email, otp)
  } catch (err) {
    console.warn('[DEV] Échec envoi email OTP:', err.message)
    console.warn(`[DEV] OTP pour ${email} : ${otp}`)
  }
  return c.json({ ok: true })
})

admin.post('/verify-otp', async (c) => {
  const { email, otp } = await c.req.json()
  const [adminUser] = await sql`SELECT * FROM admin WHERE email = ${email}`
  if (!adminUser) return c.json({ error: 'Invalid OTP' }, 401)
  const now = new Date().toISOString()
  if (adminUser.otp_code !== otp || adminUser.otp_expires < now)
    return c.json({ error: 'Invalid or expired OTP' }, 401)
  await sql`UPDATE admin SET otp_code = NULL, otp_expires = NULL WHERE id = ${adminUser.id}`
  const token = jwt.sign({ sub: adminUser.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '4h' })
  return c.json({ token })
})

admin.use('/users/*', adminMiddleware)
admin.use('/settings/*', adminMiddleware)

admin.post('/settings/request-otp', async (c) => {
  console.log('[settings/request-otp] hit, adminId=', c.get('adminId'))
  const adminId = c.get('adminId')
  const [adminUser] = await sql`SELECT * FROM admin WHERE id = ${adminId}`
  if (!adminUser) return c.json({ error: 'Not found' }, 404)
  const otp = generateOtp()
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await sql`UPDATE admin SET otp_code = ${otp}, otp_expires = ${expires} WHERE id = ${adminId}`
  try { await sendOtpEmail(adminUser.email, otp) } catch (err) {
    console.warn('[DEV] OTP:', otp)
  }
  return c.json({ ok: true })
})

admin.post('/settings/confirm', async (c) => {
  try {
    const adminId = c.get('adminId')
    const body = await c.req.json()
    const { otp, newEmail, newPassword } = body
    console.log('[settings/confirm] adminId=%s otp=%s hasEmail=%s hasPassword=%s', adminId, otp, !!newEmail, !!newPassword)
    const [adminUser] = await sql`SELECT * FROM admin WHERE id = ${adminId}`
    if (!adminUser) return c.json({ error: 'Not found' }, 404)
    const now = new Date().toISOString()
    console.log('[settings/confirm] otp_code=%s otp_expires=%s now=%s', adminUser.otp_code, adminUser.otp_expires, now)
    if (adminUser.otp_code !== otp || adminUser.otp_expires < now)
      return c.json({ error: 'Invalid or expired OTP' }, 401)
    await sql`UPDATE admin SET otp_code = NULL, otp_expires = NULL WHERE id = ${adminId}`
    if (newEmail) await sql`UPDATE admin SET email = ${newEmail} WHERE id = ${adminId}`
    if (newPassword) {
      const password_hash = await bcrypt.hash(newPassword, 12)
      await sql`UPDATE admin SET password_hash = ${password_hash} WHERE id = ${adminId}`
    }
    return c.json({ ok: true })
  } catch (err) {
    console.error('[settings/confirm] error:', err.message, err.stack)
    return c.json({ error: err.message }, 500)
  }
})

admin.get('/apps', async (c) => {
  const apps = await sql`SELECT id, slug, name, icon FROM apps WHERE is_active = TRUE`
  return c.json({ apps })
})

admin.get('/users', async (c) => {
  const users = await sql`SELECT id, username, email, is_active, created_at FROM users`
  const withAccess = await Promise.all(users.map(async u => {
    const app_ids = (await sql`SELECT app_id FROM user_app_access WHERE user_id = ${u.id}`).map(r => r.app_id)
    return { ...u, app_ids }
  }))
  return c.json({ users: withAccess })
})

admin.post('/users', async (c) => {
  const { username, email, password, is_active = true, app_ids = [] } = await c.req.json()
  const password_hash = await bcrypt.hash(password, 12)
  const [r] = await sql`
    INSERT INTO users (username, email, password_hash, is_active) VALUES (${username}, ${email}, ${password_hash}, ${is_active})
    RETURNING id
  `
  for (const appId of app_ids)
    await sql`INSERT INTO user_app_access (user_id, app_id) VALUES (${r.id}, ${appId}) ON CONFLICT DO NOTHING`
  return c.json({ id: r.id }, 201)
})

admin.put('/users/:id', async (c) => {
  const { id } = c.req.param()
  const { username, email, password, is_active } = await c.req.json()
  if (password) {
    const password_hash = await bcrypt.hash(password, 12)
    await sql`UPDATE users SET password_hash = ${password_hash} WHERE id = ${id}`
  }
  await sql`UPDATE users SET username = ${username}, email = ${email}, is_active = ${is_active} WHERE id = ${id}`
  return c.json({ ok: true })
})

admin.delete('/users/:id', async (c) => {
  const { id } = c.req.param()
  await sql`DELETE FROM users WHERE id = ${id}`
  return c.json({ ok: true })
})

admin.put('/users/:id/access', async (c) => {
  const { id } = c.req.param()
  const { appIds = [], workspaceAccess = [] } = await c.req.json()
  await sql`DELETE FROM user_app_access WHERE user_id = ${id}`
  for (const appId of appIds)
    await sql`INSERT INTO user_app_access (user_id, app_id) VALUES (${id}, ${appId}) ON CONFLICT DO NOTHING`
  await sql`DELETE FROM user_workspace_access WHERE user_id = ${id}`
  for (const { workspaceId, role } of workspaceAccess)
    await sql`INSERT INTO user_workspace_access (user_id, workspace_id, role) VALUES (${id}, ${workspaceId}, ${role ?? 'member'}) ON CONFLICT DO NOTHING`
  return c.json({ ok: true })
})

export default admin
