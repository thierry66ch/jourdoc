import jwt from 'jsonwebtoken'

export function authMiddleware(c, next) {
  const header = c.req.header('Authorization') ?? ''
  const token = header.replace('Bearer ', '') || c.req.query('t') || ''
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    c.set('userId', payload.sub)
    return next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
