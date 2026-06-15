import { useTranslation } from 'react-i18next'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const lang = i18n.language?.slice(0, 2) ?? 'fr'

  return (
    <div className="lang-switcher" role="group" aria-label="Langue">
      {['fr', 'en'].map((l) => (
        <button
          key={l}
          className={`lang-btn${lang === l ? ' active' : ''}`}
          onClick={() => i18n.changeLanguage(l)}
          aria-pressed={lang === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
