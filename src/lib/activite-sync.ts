// Activité du carnet vers le journal (1.8.10, GO de Brice le 02/10/2026).
//
// Les mêmes compteurs que le panneau « Ton activité » (écrits, messages au
// mentor, trades, jugements, notes ouvertes), jour par jour, pour savoir ce
// que font nos membres en général. Des nombres, aucun contenu. Rien ne les
// affiche encore : c'est la tuyauterie du futur suivi dans le cockpit.
//
// Règles :
// - seulement si le membre est connecté ET n'a pas coupé la sync (la
//   politique de confidentialité le dit dans ces termes) ;
// - seulement les jours qui ont changé depuis le dernier envoi réussi : le
//   premier envoi d'un appareil porte jusqu'à 400 jours, les suivants
//   quelques-uns ; un jour revenu à zéro (note supprimée) repart à zéro ;
// - au plus un essai toutes les 15 minutes : loadData() tourne à chaque note
//   enregistrée, il ne faut pas un appel réseau à chaque fois ;
// - un identifiant d'appareil tiré au hasard : deux ordinateurs ne s'écrasent
//   pas, le serveur garde une ligne par appareil et par jour.
import storage from './storage'
import { getSession } from './auth'
import { activiteDuCarnet, cleJour, type Journee } from './activite'
import { lireConsultations } from './consultations'
import { envoyerActiviteAuJournal, type JourActivitePourJournal } from './sync'
import type { NoteSummary } from '@/types/academic'

const CLE = 'carnetActiviteEnvoi'
const INTERVALLE_MS = 15 * 60_000
/** Le serveur accepte 410 jours en arrière : on reste en deçà */
const JOURS_GARDES = 400
const ZERO = '0,0,0,0,0'

interface EtatEnvoi {
  appareil: string
  /** Compte pour lequel `envoye` vaut : un autre membre sur le même appareil repart de zéro */
  userId?: string
  /** Dernière signature envoyée avec succès, par jour */
  envoye: Record<string, string>
  dernierEssai: number
}

const signature = (j: Journee) => `${j.ecrits},${j.mentor},${j.trades},${j.jugements},${j.consultees}`

function depuisSignature(jour: string, s: string): JourActivitePourJournal {
  const [ecrits, mentor, trades, jugements, consultees] = s.split(',').map(Number)
  return { jour, ecrits, mentor, trades, jugements, consultees }
}

async function lireEtat(): Promise<EtatEnvoi> {
  const r = await chrome.storage.local.get(CLE)
  const etat = r[CLE] as EtatEnvoi | undefined
  return etat?.appareil ? etat : { appareil: crypto.randomUUID(), envoye: {}, dernierEssai: 0 }
}

/** À appeler quand la liste des notes est (re)chargée. Jamais bloquant, jamais bruyant. */
export async function envoyerActivite(notes: NoteSummary[]): Promise<void> {
  try {
    const settings = await storage.getSettings()
    if (settings.journalSync?.syncCoupee) return
    const session = await getSession()
    if (!session) return

    const etat = await lireEtat()
    if (Date.now() - etat.dernierEssai < INTERVALLE_MS) return
    etat.dernierEssai = Date.now()
    if (etat.userId !== session.user.id) {
      etat.userId = session.user.id
      etat.envoye = {}
    }

    const plusTot = cleJour(Date.now() - JOURS_GARDES * 86_400_000)
    const plusTard = cleJour(Date.now() + 86_400_000)
    const actuel: Record<string, string> = {}
    for (const [jour, j] of activiteDuCarnet(notes, await lireConsultations())) {
      if (jour >= plusTot && jour <= plusTard) actuel[jour] = signature(j)
    }

    const aEnvoyer: JourActivitePourJournal[] = []
    for (const jour of new Set([...Object.keys(actuel), ...Object.keys(etat.envoye)])) {
      if (jour < plusTot) { delete etat.envoye[jour]; continue }
      const s = actuel[jour] ?? ZERO
      if (etat.envoye[jour] === s) continue
      if (s === ZERO && !(jour in etat.envoye)) continue
      aEnvoyer.push(depuisSignature(jour, s))
    }

    if (aEnvoyer.length > 0) {
      const { ok } = await envoyerActiviteAuJournal(etat.appareil, aEnvoyer)
      if (ok) {
        for (const j of aEnvoyer) {
          const s = `${j.ecrits},${j.mentor},${j.trades},${j.jugements},${j.consultees}`
          if (s === ZERO) delete etat.envoye[j.jour]
          else etat.envoye[j.jour] = s
        }
      }
    }
    await chrome.storage.local.set({ [CLE]: etat })
  } catch {
    /* une mesure d'usage ne doit jamais gêner le carnet */
  }
}
