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
