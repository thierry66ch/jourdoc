import jwt from 'jsonwebtoken'

export function adminMiddleware(c, next) {
  const header = c.req.header('Authorization') ?? ''
  const token = header.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    c.set('adminId', payload.sub)
    return next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
