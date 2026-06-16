import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import { randomBytes } from 'node:crypto'
import sql from '../../db/db.js'

const auth = new Hono()

async function sendResetEmail(to, resetUrl) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'Réinitialisation de mot de passe — JourDoc',
    text: `Cliquez sur ce lien pour réinitialiser votre mot de passe :\n\n${resetUrl}\n\nCe lien expire dans 1 heure.`,
    html: `<p>Cliquez sur ce lien pour réinitialiser votre mot de passe :</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Ce lien expire dans 1 heure.</p>`,
  })
}

auth.post('/forgot-password', async (c) => {
  const { identifier } = await c.req.json()
  if (!identifier) return c.json({ error: 'Champ requis' }, 400)
  const [user] = await sql`
    SELECT id, email FROM users WHERE (email = ${identifier} OR username = ${identifier}) AND is_active = TRUE
  `
  // Toujours répondre OK pour ne pas révéler si l'email existe
  if (!user) return c.json({ ok: true })
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  await sql`UPDATE users SET reset_token = ${token}, reset_expires = ${expires} WHERE id = ${user.id}`
  const proto = c.req.header('x-forwarded-proto') ?? 'https'
  const host  = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? 'localhost'
  const resetUrl = `${proto}://${host}/reset-password?token=${token}`
  try {
    await sendResetEmail(user.email, resetUrl)
  } catch (err) {
    console.warn('[forgot-password] email failed:', err.message, '| reset URL:', resetUrl)
  }
  return c.json({ ok: true })
})

auth.post('/reset-password', async (c) => {
  const { token, password } = await c.req.json()
  if (!token || !password) return c.json({ error: 'Données manquantes' }, 400)
  const now = new Date().toISOString()
  const [user] = await sql`
    SELECT id FROM users WHERE reset_token = ${token} AND reset_expires > ${now} AND is_active = TRUE
  `
  if (!user) return c.json({ error: 'Lien invalide ou expiré' }, 400)
  const password_hash = await bcrypt.hash(password, 12)
  await sql`UPDATE users SET password_hash = ${password_hash}, reset_token = NULL, reset_expires = NULL WHERE id = ${user.id}`
  return c.json({ ok: true })
})

auth.post('/login', async (c) => {
  const { identifier, password } = await c.req.json()

  const [user] = await sql`
    SELECT * FROM users WHERE (email = ${identifier} OR username = ${identifier}) AND is_active = TRUE
  `
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' }
  )

  return c.json({ token })
})

auth.post('/logout', (c) => c.json({ ok: true }))

export default auth
