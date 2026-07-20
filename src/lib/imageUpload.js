// Préparation des images côté navigateur avant upload.
//
// Pourquoi : Vercel plafonne le corps d'une requête serverless à ~4,5 Mo. Une photo
// de galerie/caméra ≥ ~4,5 Mo déclenche un 413 FUNCTION_PAYLOAD_TOO_LARGE *avant*
// même d'atteindre notre code. On redimensionne donc côté client à la même cible que
// le serveur (MAX_DIM = 1600, qualité 90), ce qui évite aussi une double compression
// (le serveur ne re-encode pas une image déjà ≤ 1600).
//
// Important : un re-encodage canvas EFFACE les métadonnées EXIF, donc la date de prise
// de vue — cruciale pour le journal. On lit donc la date EXIF sur l'ORIGINAL avant le
// resize et on la transmet séparément (champ `dates` aligné sur `files`).

const MAX_DIM = 1600           // aligné sur le serveur (processImage)
const JPEG_QUALITY = 0.9       // aligné sur le serveur (quality 90)
const SIZE_THRESHOLD = 3.8 * 1024 * 1024  // marge sous la limite Vercel (~4,5 Mo)

// Types raster que le canvas sait décoder de façon fiable (Chrome/Android en tête).
// Le HEIC n'est PAS décodable par canvas → on laisse l'original au serveur (heic-convert).
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Lit la date de prise de vue EXIF d'un fichier image → 'YYYY-MM-DD' ou null.
// Même logique que le serveur (DateTimeOriginal → DateTime → DateTimeDigitized).
export async function readExifDate(file) {
  if (!file || !file.type?.startsWith('image/')) return null
  try {
    const { default: ExifReader } = await import('exifreader')
    const buf = await file.arrayBuffer()
    const tags = ExifReader.load(buf, { expanded: false })
    const raw = (tags['DateTimeOriginal'] ?? tags['DateTime'] ?? tags['DateTimeDigitized'])?.description
    if (raw && /^\d{4}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 10).replace(/:/g, '-')
  } catch { /* pas d'EXIF lisible */ }
  return null
}

// Redimensionne un fichier image à MAX_DIM (côté long) si nécessaire.
// - PNG → reste PNG (préserve la transparence, comme le serveur).
// - JPEG/WebP → JPEG qualité 0.9.
// - GIF (potentiellement animé), HEIC, PDF, MD, ou tout ce que le canvas ne décode pas
//   → renvoyé tel quel.
// Ne redimensionne que si utile : trop grand en pixels OU trop lourd pour la limite.
// L'orientation EXIF est appliquée à l'image dessinée (imageOrientation: 'from-image').
export async function resizeImageFile(file, { maxDim = MAX_DIM, quality = JPEG_QUALITY } = {}) {
  if (!file || !RESIZABLE.has(file.type)) return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file // navigateur incapable de décoder → on laisse le serveur gérer
  }

  const { width, height } = bitmap
  const tooBig = width > maxDim || height > maxDim || file.size > SIZE_THRESHOLD
  if (!tooBig) { bitmap.close?.(); return file }

  const scale = Math.min(1, maxDim / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const isPng = file.type === 'image/png'
  const outType = isPng ? 'image/png' : 'image/jpeg'
  const outExt = isPng ? 'png' : 'jpg'

  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, outType, isPng ? undefined : quality)
  )
  if (!blob) return file // échec toBlob → repli sur l'original

  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.${outExt}`, { type: outType, lastModified: Date.now() })
}

// Prépare une liste de fichiers pour l'upload : lit la date EXIF de l'original puis
// redimensionne. Renvoie deux tableaux ALIGNÉS par index :
//   { files:  [File …],       // versions redimensionnées (ou originales)
//     dates:  ['YYYY-MM-DD'…] } // date EXIF ('' si inconnue), à envoyer en champ `dates`
// La date est lue AVANT le resize (le resize efface l'EXIF).
export async function prepareUploadFiles(fileList) {
  const files = []
  const dates = []
  for (const f of fileList) {
    const date = await readExifDate(f)          // sur l'original, EXIF encore présent
    const resized = await resizeImageFile(f)
    files.push(resized)
    dates.push(date || '')
  }
  return { files, dates }
}
