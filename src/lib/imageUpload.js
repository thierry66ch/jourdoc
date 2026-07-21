// Préparation des images côté navigateur avant upload.
//
// Pourquoi : Vercel plafonne le corps d'une requête serverless à ~4,5 Mo. Une photo
// de galerie/caméra ≥ ~4,5 Mo déclenche un 413 FUNCTION_PAYLOAD_TOO_LARGE *avant*
// même d'atteindre notre code. On redimensionne donc côté client à la même cible que
// le serveur (MAX_DIM = 1600, qualité 90), ce qui évite aussi une double compression
// (le serveur ne re-encode pas une image déjà ≤ 1600).
//
// Décodage via <img> + canvas (support universel, y compris mobile). On a d'abord
// tenté createImageBitmap({imageOrientation}) mais cette forme échoue/gèle sur certains
// navigateurs Android → on retombait sur l'original (413 persistant). L'approche <img>
// ne gèle jamais (onload/onerror) et applique l'orientation EXIF nativement.
//
// Important : un re-encodage efface les métadonnées EXIF, donc la date de prise de vue —
// cruciale pour le journal. On lit donc la date EXIF sur l'ORIGINAL avant le resize et on
// la transmet séparément (champ `dates` aligné sur `files`).

const MAX_DIM = 1600           // aligné sur le serveur (processImage)
const JPEG_QUALITY = 0.9       // aligné sur le serveur (quality 90)
const SIZE_THRESHOLD = 3.8 * 1024 * 1024  // marge sous la limite Vercel (~4,5 Mo)
const DECODE_TIMEOUT = 20000   // garde-fou anti-blocage (ms)

// Extensions qu'on ne redimensionne jamais (non-images, ou formats à préserver tels quels).
const SKIP_EXT = new Set(['pdf', 'md', 'markdown', 'gif', 'svg'])
// Formats que le navigateur ne sait pas décoder → resize impossible côté client.
const UNDECODABLE_EXT = new Set(['heic', 'heif'])

function extOf(file) {
  return (file?.name?.split('.').pop() || '').toLowerCase()
}

// true si le navigateur ne pourra pas décoder ce fichier (HEIC/HEIF) → resize impossible.
export function isUndecodable(file) {
  const ext = extOf(file)
  const type = (file?.type || '').toLowerCase()
  return UNDECODABLE_EXT.has(ext) || type.includes('heic') || type.includes('heif')
}

// Lit la date de prise de vue EXIF d'un fichier image → 'YYYY-MM-DD' ou null.
// Même logique que le serveur (DateTimeOriginal → DateTime → DateTimeDigitized).
export async function readExifDate(file) {
  if (!file) return null
  try {
    const { default: ExifReader } = await import('exifreader')
    const buf = await file.arrayBuffer()
    const tags = ExifReader.load(buf, { expanded: false })
    const raw = (tags['DateTimeOriginal'] ?? tags['DateTime'] ?? tags['DateTimeDigitized'])?.description
    if (raw && /^\d{4}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 10).replace(/:/g, '-')
  } catch { /* pas d'EXIF lisible */ }
  return null
}

// Décode un fichier image en <img> chargé (orientation EXIF appliquée par le navigateur).
// Se résout toujours (onload) ou rejette (onerror/timeout) — ne gèle jamais.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const done = (fn, arg) => { clearTimeout(timer); fn(arg) }
    const timer = setTimeout(() => { URL.revokeObjectURL(url); done(reject, new Error('timeout')) }, DECODE_TIMEOUT)
    img.onload = () => done(resolve, { img, url })
    img.onerror = () => { URL.revokeObjectURL(url); done(reject, new Error('decode')) }
    img.src = url
  })
}

// Redimensionne un fichier image à MAX_DIM (côté long) si nécessaire.
// - PNG → reste PNG (préserve la transparence, comme le serveur).
// - JPEG/WebP/autres décodables → JPEG qualité 0.9.
// - GIF/SVG/PDF/MD, HEIC (indécodable), ou tout ce que le navigateur ne décode pas
//   → renvoyé tel quel.
// Ne redimensionne que si utile : trop grand en pixels OU trop lourd pour la limite.
export async function resizeImageFile(file, { maxDim = MAX_DIM, quality = JPEG_QUALITY } = {}) {
  if (!file) return file
  const ext = extOf(file)
  const type = (file.type || '').toLowerCase()
  if (SKIP_EXT.has(ext)) return file
  if (type && !type.startsWith('image/')) return file  // non-image typé explicitement
  if (isUndecodable(file)) return file                  // HEIC/HEIF : le serveur convertira

  let loaded
  try {
    loaded = await loadImage(file)
  } catch {
    return file  // indécodable → on laisse l'original (le serveur tentera sa chance)
  }
  const { img, url } = loaded
  const w0 = img.naturalWidth, h0 = img.naturalHeight
  const cleanup = () => URL.revokeObjectURL(url)

  if (!w0 || !h0) { cleanup(); return file }
  const tooBig = w0 > maxDim || h0 > maxDim || file.size > SIZE_THRESHOLD
  if (!tooBig) { cleanup(); return file }

  const scale = Math.min(1, maxDim / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  cleanup()

  const isPng = ext === 'png' || type === 'image/png'
  const outType = isPng ? 'image/png' : 'image/jpeg'
  const outExt = isPng ? 'png' : 'jpg'

  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, outType, isPng ? undefined : quality)
  )
  if (!blob) return file  // échec toBlob → repli sur l'original

  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.${outExt}`, { type: outType, lastModified: Date.now() })
}

// Prépare une liste de fichiers pour l'upload : lit la date EXIF de l'original puis
// redimensionne. Renvoie deux tableaux ALIGNÉS par index :
//   { files:  [File …],       // versions redimensionnées (ou originales)
//     dates:  ['YYYY-MM-DD'…], // date EXIF ('' si inconnue), à envoyer en champ `dates`
//     undecodable: [File …] }  // fichiers non décodables encore trop lourds (risque 413)
// La date est lue AVANT le resize (le resize efface l'EXIF).
export async function prepareUploadFiles(fileList) {
  const files = []
  const dates = []
  const undecodable = []
  for (const f of fileList) {
    const date = await readExifDate(f)          // sur l'original, EXIF encore présent
    const resized = await resizeImageFile(f)
    files.push(resized)
    dates.push(date || '')
    // Signale un fichier qu'on n'a pas pu réduire et qui dépasse la limite Vercel.
    if (resized === f && f.size > SIZE_THRESHOLD) undecodable.push(f)
  }
  return { files, dates, undecodable }
}
