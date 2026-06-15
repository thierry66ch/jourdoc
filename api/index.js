// api/index.js — point d'entrée Vercel serverless
// Remplace le @hono/node-server de V1.
// Vercel appelle cette fonction pour chaque requête /api/*.

import { handle } from 'hono/vercel'
import app from '../server/app.js'

export const config = {
  runtime: 'nodejs',
}

export default handle(app)
