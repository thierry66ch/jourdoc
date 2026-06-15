/* global __BUILD_NUMBER__, __BUILD_DATE__ */

function formatDate(iso) {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  // UTC pour éviter le décalage horaire (build.json stocké en UTC)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export default function Footer() {
  return (
    <footer className="app-footer">
      pogil apps — build {__BUILD_NUMBER__} · {formatDate(__BUILD_DATE__)}
    </footer>
  )
}
