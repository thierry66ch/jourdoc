import { Hono } from 'hono'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import sql from '../../db/db.js'

const auth = new Hono()

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
