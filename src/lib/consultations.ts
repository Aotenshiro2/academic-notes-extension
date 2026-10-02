// Notes ouvertes, jour par jour (1.8.10). Brice, le 02/10 : un membre qui
// vient relire ses notes sans rien écrire est quand même passé, et ça doit se
// voir dans son panneau d'activité.
//
// On note l'ouverture d'une note, pas l'ouverture du panneau : le panneau
// latéral peut rester ouvert d'un onglet à l'autre sans que l'élève y fasse
// rien, alors qu'ouvrir une note est un geste. Une note compte une fois par
// jour, même rouverte dix fois.
//
// Rangé à part des notes (chrome.storage.local) : écrire dans la note la
// marquerait modifiée et la renverrait au journal à chaque lecture.

const CLE = 'carnetConsultations'
/** Un peu plus que les douze mois du panneau */
const JOURS_GARDES = 400

type Registre = Record<string, string[]>

function cleJourLocal(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

async function lire(): Promise<Registre> {
  try {
    const r = await chrome.storage.local.get(CLE)
    return (r[CLE] as Registre) ?? {}
  } catch { return {} }
}

function compter(reg: Registre): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [jour, ids] of Object.entries(reg)) out[jour] = ids.length
  return out
}

/** À appeler quand l'élève ouvre une note. Jamais bloquant. */
export async function noterConsultation(noteId: string): Promise<void> {
  try {
    const reg = await lire()
    const aujourdhui = cleJourLocal()
    // Un préfixe suffit à dédoublonner dans une journée, et pèse moins
    const id = noteId.slice(0, 12)
    const ids = reg[aujourdhui] ?? []
    if (ids.includes(id)) return
    reg[aujourdhui] = [...ids, id]
    const limite = cleJourLocal(new Date(Date.now() - JOURS_GARDES * 86_400_000))
    for (const jour of Object.keys(reg)) if (jour < limite) delete reg[jour]
    await chrome.storage.local.set({ [CLE]: reg })
  } catch { /* le panneau d'activité ne doit jamais gêner l'ouverture d'une note */ }
}

/** Nombre de notes ouvertes par jour. */
export async function lireConsultations(): Promise<Record<string, number>> {
  return compter(await lire())
}

/** Suit les ouvertures en direct (autre vue, plein écran). Rend le désabonnement. */
export function surveillerConsultations(cb: (parJour: Record<string, number>) => void): () => void {
  const ecoute = (changes: Record<string, chrome.storage.StorageChange>, zone: string) => {
    if (zone === 'local' && changes[CLE]) cb(compter((changes[CLE].newValue as Registre) ?? {}))
  }
  try { chrome.storage.onChanged.addListener(ecoute) } catch { return () => {} }
  return () => { try { chrome.storage.onChanged.removeListener(ecoute) } catch { /* rien */ } }
}
