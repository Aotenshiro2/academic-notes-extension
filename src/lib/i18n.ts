// Langue d'usage de l'extension.
//
// Le drapeau en bas du panneau était décoratif depuis toujours : `settings.language`
// existait dans le type mais n'était lu nulle part. Il devient un vrai
// sélecteur.
//
// ── Ajouter une langue ──────────────────────────────────────────────────────
// Deux gestes, et aucun refactor :
//   1. une entrée dans LANGUES ci-dessous (code, nom, drapeau, locale) ;
//   2. un objet dans DICO avec les clés qu'on a traduites.
// Les clés absentes retombent sur le français. Une langue à moitié traduite
// reste donc utilisable — on n'affiche jamais une clé brute à l'élève, et on
// peut livrer une langue par morceaux au lieu d'attendre les 500 chaînes.
//
// Le français est la langue de référence : toute clé DOIT y exister.

export const LANGUES = [
  { code: 'fr', nom: 'Français', drapeau: '🇫🇷', locale: 'fr-FR' },
  { code: 'en', nom: 'English', drapeau: '🇬🇧', locale: 'en-GB' },
] as const

export type Langue = (typeof LANGUES)[number]['code']
export const LANGUE_REFERENCE: Langue = 'fr'

const CLE = 'carnet-langue'
const EVT = 'carnet-langue-change'

// ── Dictionnaire ─────────────────────────────────────────────────────────────
// Clés en français plat, groupées par surface. On ne met ici que ce qui est
// VU par l'élève : les messages de journal serveur et les commentaires de code
// restent en français.

const FR = {
  // Barre du haut
  'entete.exporter': 'Exporter la note',
  'entete.exporterEnCours': 'Export en cours…',
  'entete.exporterAucune': 'Sélectionnez une note pour exporter',
  'entete.exportPdf': 'Exporter en PDF',
  'entete.exportDocx': 'Google Docs (.docx)',
  'entete.exportDrive': 'Google Drive',
  'entete.analyser': 'Analyser avec une IA',
  'entete.analyserAucune': 'Sélectionnez une note pour analyser',
  'entete.pleinEcran': 'Ouvrir dans Journal d’Études',
  'entete.historique': 'Historique des notes',
  'entete.nouvelle': 'Nouvelle capture',

  // Barre de capture
  'capture.placeholder': 'Écrivez ou capturez...',
  'capture.placeholderNote': 'Ajouter du contenu...',
  'capture.image': 'Image',
  'capture.imageSous': 'Depuis vos fichiers',
  'capture.ecran': 'Capture d’écran',
  'capture.ecranSous': 'Photo de la page',
  'capture.externe': 'Capture externe',
  'capture.externeSous': 'Zoom, app desktop...',
  'capture.intelligente': 'Capture intelligente',
  'capture.intelligenteSous': 'Résumé + points clés',
  'capture.intelligenteSousIA': 'Résumé et points clés, lus par l’IA',
  'capture.enCours': 'Capture...',
  'capture.dol': 'Poser un DOL',
  'capture.warmup': 'Lancer un warmup',

  // Écran d'accueil
  'accueil.titre': 'Prêt à prendre des notes ?',
  'accueil.sous': 'Écrivez dans la zone ci-dessous ou capturez cette page.',
  'accueil.capturerPage': 'Capturer cette page',
  'accueil.capturerPageSous': 'Screenshot + titre et URL',

  // Menu des paramètres
  'menu.visiteur': 'Visiteur',
  'menu.connecte': 'Connecté',
  'menu.nonConnecte': 'Non connecté',
  'menu.seConnecter': 'Se connecter à AOKnowledge',
  'menu.parametres': 'Paramètres',
  'menu.configurerIA': 'Configurer son IA',
  'menu.compte': 'Compte AOKnowledge',
  'menu.bonnesPratiques': 'Bonnes pratiques',
  'menu.versions': 'Versions et feuille de route',
  'menu.forfait': 'Mon forfait',
  'menu.inviter': 'Inviter un ami',
  'menu.autresOutils': 'Autres outils AOK',
  'menu.evaluer': 'Évaluer l’extension',
  'menu.aide': 'Paramètres et aide',

  // Note courante
  'note.resume': 'Résumé',
  'note.pointsCles': 'Points clés',
  'note.approfondir': 'Approfondir cette note',
  'note.approfondirVerrouille': 'Approfondir · Carnet Premium',
  'note.approfondirEnCours': 'Étude en cours…',
  'note.approfondirAide': 'Relire cette note dans le cadre de la méthode et écrire la lecture dedans',
  'note.approfondirRefus': 'L’approfondissement fait partie du Carnet Premium',
  'note.etudeAjoutee': 'Étude ajoutée à la note.',
  'note.etudeIndisponible': 'Étude indisponible pour le moment.',
  'note.nonCapture': 'Non capturé',

  // État de synchronisation
  'sync.aFaire': 'à synchroniser',
  'sync.ok': 'sync',
  'sync.langue': 'Langue',

  // Capture intelligente, retours
  'smart.analyse': 'Analyse de la page en cours...',
  'smart.echec': 'Erreur lors de la capture intelligente',
} as const

export type CleI18n = keyof typeof FR

// Traductions partielles autorisées : ce qui manque retombe sur FR.
const EN: Partial<Record<CleI18n, string>> = {
  'entete.exporter': 'Export note',
  'entete.exporterEnCours': 'Exporting…',
  'entete.exporterAucune': 'Select a note to export',
  'entete.exportPdf': 'Export as PDF',
  'entete.exportDocx': 'Google Docs (.docx)',
  'entete.exportDrive': 'Google Drive',
  'entete.analyser': 'Analyse with an AI',
  'entete.analyserAucune': 'Select a note to analyse',
  'entete.pleinEcran': 'Open in Study Journal',
  'entete.historique': 'Note history',
  'entete.nouvelle': 'New capture',

  'capture.placeholder': 'Write or capture...',
  'capture.placeholderNote': 'Add to this note...',
  'capture.image': 'Image',
  'capture.imageSous': 'From your files',
  'capture.ecran': 'Screenshot',
  'capture.ecranSous': 'Picture of the page',
  'capture.externe': 'External capture',
  'capture.externeSous': 'Zoom, desktop app...',
  'capture.intelligente': 'Smart capture',
  'capture.intelligenteSous': 'Summary + key points',
  'capture.intelligenteSousIA': 'Summary and key points, read by AI',
  'capture.enCours': 'Capturing...',
  'capture.dol': 'Set a DOL',
  'capture.warmup': 'Start a warmup',

  'accueil.titre': 'Ready to take notes?',
  'accueil.sous': 'Write below, or capture this page.',
  'accueil.capturerPage': 'Capture this page',
  'accueil.capturerPageSous': 'Screenshot + title and URL',

  'menu.visiteur': 'Visitor',
  'menu.connecte': 'Signed in',
  'menu.nonConnecte': 'Not signed in',
  'menu.seConnecter': 'Sign in to AOKnowledge',
  'menu.parametres': 'Settings',
  'menu.configurerIA': 'Set up your AI',
  'menu.compte': 'AOKnowledge account',
  'menu.bonnesPratiques': 'Good practice',
  'menu.versions': 'Versions and roadmap',
  'menu.forfait': 'My plan',
  'menu.inviter': 'Invite a friend',
  'menu.autresOutils': 'Other AOK tools',
  'menu.evaluer': 'Rate the extension',
  'menu.aide': 'Settings and help',

  'note.resume': 'Summary',
  'note.pointsCles': 'Key points',
  'note.approfondir': 'Go deeper on this note',
  'note.approfondirVerrouille': 'Go deeper · Carnet Premium',
  'note.approfondirEnCours': 'Studying…',
  'note.approfondirAide': 'Read this note back through the method, and write that reading into it',
  'note.approfondirRefus': 'Going deeper is part of Carnet Premium',
  'note.etudeAjoutee': 'Study added to the note.',
  'note.etudeIndisponible': 'Study unavailable right now.',
  'note.nonCapture': 'Not captured',

  'sync.aFaire': 'to sync',
  'sync.ok': 'synced',
  'sync.langue': 'Language',

  'smart.analyse': 'Reading the page…',
  'smart.echec': 'Smart capture failed',
}

const DICO: Record<Langue, Partial<Record<CleI18n, string>>> = { fr: FR, en: EN }

// ── Lecture, écriture, réactivité ────────────────────────────────────────────
// Même motif que show-meta.ts : localStorage plus un event, pour que toutes les
// vues ouvertes suivent le changement sans rechargement.

function estLangue(v: unknown): v is Langue {
  return typeof v === 'string' && LANGUES.some(l => l.code === v)
}

export function getLangue(): Langue {
  try {
    const v = localStorage.getItem(CLE)
    if (estLangue(v)) return v
  } catch { /* stockage indisponible : on retombe sur le français */ }
  return LANGUE_REFERENCE
}

export function setLangue(langue: Langue): void {
  try { localStorage.setItem(CLE, langue) } catch { /* best-effort */ }
  window.dispatchEvent(new Event(EVT))
}

/** La langue suivante dans le cycle — le drapeau fait tourner les langues
 *  disponibles, ce qui restera juste quand il y en aura quatre. */
export function langueSuivante(actuelle: Langue = getLangue()): Langue {
  const i = LANGUES.findIndex(l => l.code === actuelle)
  return LANGUES[(i + 1) % LANGUES.length].code
}

export function infoLangue(code: Langue = getLangue()) {
  return LANGUES.find(l => l.code === code) ?? LANGUES[0]
}

export function subscribeLangue(cb: (langue: Langue) => void): () => void {
  const handler = () => cb(getLangue())
  window.addEventListener(EVT, handler)
  return () => window.removeEventListener(EVT, handler)
}

// ── Traduction ───────────────────────────────────────────────────────────────

/**
 * Traduit une clé. Les remplacements se notent {nom} dans la chaîne.
 *
 * Repli en cascade : langue courante, puis français, puis la clé elle-même —
 * ce dernier cas ne devrait jamais arriver, le type CleI18n l'empêche à la
 * compilation.
 */
export function t(cle: CleI18n, remplacements?: Record<string, string | number>): string {
  const langue = getLangue()
  let texte = DICO[langue]?.[cle] ?? FR[cle] ?? cle
  if (remplacements) {
    for (const [nom, valeur] of Object.entries(remplacements)) {
      // `split/join` plutôt que `replaceAll` : la cible TypeScript du projet
      // est antérieure à ES2021, et une regex globale demanderait d'échapper
      // le nom du paramètre pour rien.
      texte = texte.split(`{${nom}}`).join(String(valeur))
    }
  }
  return texte
}

/** Locale à passer aux fonctions de date. Remplace les 25 `fr-FR` en dur. */
export function locale(): string {
  return infoLangue().locale
}

/** Ce que l'IA doit répondre. Le cadre reste rédigé en français côté serveur —
 *  le modèle raisonne dessus sans difficulté — mais la SORTIE doit suivre la
 *  langue de l'élève, sinon un anglophone reçoit des résumés en français. */
export function langueDeSortie(): Langue {
  return getLangue()
}
