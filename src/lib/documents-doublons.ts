import type { Lecture } from './documents-lecture'

// Les doublons ENTRE les fichiers d'un même dépôt (1.8.13). Pur : porté tel
// quel de Pilotage (lib/documents-doublons.ts), testé par
// tests/documents-doublons.test.ts.
//
// Un trader garde souvent deux fois la même chose : le même rapport en CSV et
// en PDF. Le journal rend une empreinte par fait lu (`lecture.empreintes`), la
// même quel que soit le format. Avant de ranger, on les compare :
// - un fichier dont TOUS les faits sont portés par un autre fichier du dépôt
//   est « même contenu que <fichier> » : il ne se range pas (le plus complet
//   des deux reste ; à contenu égal, le premier déposé) ;
// - un fichier en partie recouvert par un fichier gardé plus tôt dit « 12 déjà
//   dans <fichier> » et ne range que le reste.
// Les doublons avec ce qui est DÉJÀ rangé restent l'affaire du journal
// (`dejaConnus` de l'aperçu de l'import).

export type FichierEmpreintes = { id: string; nom: string; empreintes: string[] }

export type Recouvrement = {
  /** Tous ses faits sont portés par ce fichier du dépôt : il ne se range pas. */
  memeContenuQue: { id: string; nom: string } | null
  /** Ses faits déjà portés par un fichier gardé plus tôt dans le dépôt. */
  deja: Set<string>
  /** Les fichiers qui les portent, dans l'ordre du dépôt. */
  dejaDans: string[]
}

/** Le recouvrement de chaque fichier par les autres, dans l'ordre du dépôt. */
export function recouvrements(fichiers: FichierEmpreintes[]): Map<string, Recouvrement> {
  const ensembles = fichiers.map(fichier => new Set(fichier.empreintes))
  const resultat = new Map<string, Recouvrement>()

  // 1. Les fichiers entièrement contenus dans un autre.
  const doubles = new Map<number, number>()
  ensembles.forEach((ensemble, index) => {
    if (!ensemble.size) return
    let meilleur = -1
    ensembles.forEach((autre, autreIndex) => {
      if (autreIndex === index || autre.size < ensemble.size) return
      if (autre.size === ensemble.size && autreIndex > index) return
      for (const empreinte of ensemble) if (!autre.has(empreinte)) return
      if (meilleur < 0 || autre.size > ensembles[meilleur].size) meilleur = autreIndex
    })
    if (meilleur >= 0) doubles.set(index, meilleur)
  })

  // 2. Les autres, dans l'ordre : ce qu'un fichier gardé plus tôt porte déjà.
  const portees = new Map<string, string>()
  fichiers.forEach((fichier, index) => {
    const double = doubles.get(index)
    if (double !== undefined) {
      resultat.set(fichier.id, { memeContenuQue: { id: fichiers[double].id, nom: fichiers[double].nom }, deja: new Set(ensembles[index]), dejaDans: [fichiers[double].nom] })
      return
    }
    const deja = new Set<string>()
    const dans: string[] = []
    for (const empreinte of ensembles[index]) {
      const porteur = portees.get(empreinte)
      if (porteur) {
        deja.add(empreinte)
        if (!dans.includes(porteur)) dans.push(porteur)
      } else portees.set(empreinte, fichier.nom)
    }
    resultat.set(fichier.id, { memeContenuQue: null, deja, dejaDans: dans })
  })
  return resultat
}

/** Le nombre de faits d'une lecture, dans l'ordre supposé des empreintes. */
export function nombreDeFaits(lecture: Lecture): number {
  return (lecture.trades?.length ?? 0) + (lecture.mouvements?.length ?? 0) + (lecture.operations?.length ?? 0)
    + (lecture.facture ? 1 : 0) + (lecture.releveBroker ? 1 : 0) + (lecture.capture ? 1 : 0)
}

/**
 * La lecture sans les faits déjà portés ailleurs : ce que le fichier range
 * vraiment. Quand les empreintes ne s'alignent pas sur les faits, la lecture
 * reste entière : le journal écarte encore ses propres doublons.
 */
export function sansLesFaitsDeja(lecture: Lecture, deja: Set<string>): Lecture {
  if (!deja.size || lecture.empreintes.length !== nombreDeFaits(lecture)) return lecture
  let rang = 0
  const garder = () => !deja.has(lecture.empreintes[rang++])
  const copie: Lecture = { ...lecture }
  if (lecture.trades) copie.trades = lecture.trades.filter(garder)
  if (lecture.mouvements) copie.mouvements = lecture.mouvements.filter(garder)
  if (lecture.operations) copie.operations = lecture.operations.filter(garder)
  for (const cle of ['facture', 'releveBroker', 'capture'] as const) {
    if (lecture[cle] && !garder()) delete copie[cle]
  }
  copie.empreintes = lecture.empreintes.filter(empreinte => !deja.has(empreinte))
  return copie
}
