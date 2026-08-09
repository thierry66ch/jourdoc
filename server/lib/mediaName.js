// server/lib/mediaName.js — noms de fichiers physiques (KDrive) lisibles.
//
// Le nom affiché reste `nom_original` en base ; ce module ne concerne QUE le nom du
// fichier stocké sur WebDAV (auparavant un UUID opaque). Identifiant unique = horodatage
// YYYYMMDDHHMMSS (+ indice à 2 chiffres pour les lots, par sécurité).

// Horodatage local YYYYMMDDHHMMSS.
export function tsStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// Nom de base sûr pour WebDAV : sans extension, caractères interdits/espaces → « _ ».
export function cleanBaseName(name) {
  return String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|#^[\]{}\s]+/g, '_')
    .replace(/_+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'fichier'
}

function batchSuffix(index, total) {
  return total > 1 ? `_${String(index + 1).padStart(2, '0')}` : ''
}

// Importé (upload/inbox) : <nom_original>_<YYYYMMDDHHMMSS>[_NN].<ext>
export function importedFilename(origName, ext, ts, index = 0, total = 1) {
  return `${cleanBaseName(origName)}_${ts}${batchSuffix(index, total)}.${ext}`
}

// Collée : <YYYYMMDD>_Pasted_image_<HHMMSS>[_NN].<ext>
export function pastedFilename(ext, ts, index = 0, total = 1) {
  return `${ts.slice(0, 8)}_Pasted_image_${ts.slice(8)}${batchSuffix(index, total)}.${ext}`
}

// nom_original affiché pour une image collée.
export function pastedOriginalName(ts) {
  return `${ts.slice(0, 8)}_Pasted_image_${ts.slice(8)}`
}

// Date de prise de vue déduite du NOM de fichier → 'YYYY-MM-DD' ou null.
// Repli quand l'EXIF est absent (fréquent sur des HEIC renommés/retravaillés dont l'EXIF
// a été strippé, mais dont le nom conserve la date, ex. « 20260804 [label] 103705.heic »).
// Reconnaît une date en TÊTE : YYYYMMDD, YYYY-MM-DD ou YYYY_MM_DD.
export function dateFromFilename(name) {
  const s = String(name || '')
  const m = s.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})(?:\D|$)/)
  if (!m) return null
  const [, y, mo, d] = m
  const Y = +y, M = +mo, D = +d
  if (M < 1 || M > 12 || D < 1 || D > 31) return null
  if (Y < 1990 || Y > 2100) return null
  return `${y}-${mo}-${d}`
}
