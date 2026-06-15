import app from '../server/app.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  try {
    const protocol = (req.headers['x-forwarded-proto'] ?? 'https').split(',')[0].trim()
    const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost'
    const url = `${protocol}://${host}${req.url}`

    // Build headers
    const headers = new Headers()
    for (const [key, val] of Object.entries(req.headers)) {
      if (val === undefined) continue
      if (Array.isArray(val)) val.forEach(v => headers.append(key, v))
      else headers.set(key, val)
    }

    // Body: Vercel pre-parses JSON into req.body; raw stream for everything else
    let body = undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body !== undefined && req.body !== null) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      } else {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const buf = Buffer.concat(chunks)
        if (buf.length) body = buf
      }
    }

    const request = new Request(url, { method: req.method, headers, body })
    const response = await app.fetch(request)

    res.statusCode = response.status
    for (const [key, val] of response.headers.entries()) {
      res.setHeader(key, val)
    }
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (err) {
    console.error('[api/index.js] Unhandled error:', err)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: 'Internal server error', message: err.message }))
    }
  }
}
