// Détection et conversion du Markdown collé dans l'éditeur HTML (Tiptap).
//
// Cas visé : on colle du *source* Markdown brut (depuis un .md, un éditeur de code,
// une réponse d'IA…) dans l'éditeur riche. Le presse-papiers ne contient alors que du
// text/plain (pas de text/html). On le détecte et on le convertit en HTML riche via
// `marked`, que ProseMirror sait ensuite parser en nœuds.
//
// Si le presse-papiers contient déjà du HTML (copie depuis une page web / doc riche),
// on ne touche à rien : ProseMirror gère nativement le collage riche.

import { marked } from 'marked'

// Signaux « forts » de Markdown : au moins un suffit à déclencher la conversion.
// On reste spécifique pour ne pas transformer du texte ordinaire contenant une * isolée.
const MD_SIGNALS = [
  /^#{1,6}\s+\S/m,                    // titre  (# .. ######)
  /^\s*[-*+]\s+\S/m,                  // liste à puces
  /^\s*\d+\.\s+\S/m,                  // liste numérotée
  /^\s*>\s+\S/m,                      // citation
  /^\s*```/m,                         // bloc de code clôturé
  /^\s*([-*_])\1{2,}\s*$/m,           // règle horizontale (---, ***, ___)
  /\[[^\]]+\]\([^)\s]+\)/,            // lien [texte](url)
  /!\[[^\]]*\]\([^)\s]+\)/,           // image ![alt](url)
  /\*\*[^*\n]+\*\*/,                  // gras **texte**
  /(^|\s)__[^_\n]+__(\s|$)/,          // gras __texte__
  /(^|\s)`[^`\n]+`(\s|$)/,            // code inline `texte`
  /^\s*\|.+\|\s*$/m,                  // ligne de tableau
  /^\s*- \[[ xX]\]\s/m,              // case à cocher
]

export function looksLikeMarkdown(text) {
  if (!text || text.length < 3) return false
  return MD_SIGNALS.some(re => re.test(text))
}

// Convertit du source Markdown en HTML (GFM : tableaux, listes de tâches, sauts de ligne).
export function markdownToHtml(text) {
  return marked.parse(text, { gfm: true, breaks: true })
}
