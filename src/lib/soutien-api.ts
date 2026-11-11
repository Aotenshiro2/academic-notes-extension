// Les appels du soutien (1.9.0) : l'état pour « Mon forfait », et la page de
// paiement de l'abonnement Carnet Premium existant, marqué soutien. Le journal
// décide (Premium compris, aucun abonnement en cours) ; l'extension montre.
// Règles pures : soutien-carnet.ts.
import { getBearerToken } from './auth'
import { JOURNAL_API } from './sync'
import { cleRefusSoutien, lireEtatSoutien, urlPaiementSure, type EtatSoutien, type PeriodeSoutien } from './soutien-carnet'

/** L'état du soutien du compte, ou null (pas connecté, hors ligne, route absente) : la ligne ne se montre pas. */
export async function lireSoutien(): Promise<EtatSoutien | null> {
  const token = await getBearerToken()
  if (!token) return null
  try {
    const res = await fetch(`${JOURNAL_API}/api/carnet/soutien`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    return lireEtatSoutien(await res.json())
  } catch {
    return null
  }
}

/** La page de paiement Stripe, ou la clé de la phrase qui dit pourquoi elle ne s'ouvre pas. */
export async function demanderSoutien(periode: PeriodeSoutien): Promise<{ url: string } | { refus: ReturnType<typeof cleRefusSoutien> }> {
  const token = await getBearerToken()
  if (!token) return { refus: 'soutien.compte' }
  try {
    const res = await fetch(`${JOURNAL_API}/api/carnet/soutien`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ periode }),
    })
    const corps = await res.json().catch(() => null) as { url?: unknown; erreur?: unknown } | null
    const url = res.ok ? urlPaiementSure(corps?.url) : null
    return url ? { url } : { refus: cleRefusSoutien(corps?.erreur) }
  } catch {
    return { refus: 'soutien.erreur' }
  }
}
