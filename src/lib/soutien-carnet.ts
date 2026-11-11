// « Soutenir le Carnet » (1.9.0, labo du soutien validé par Brice le 11/11/2026).
//
// Le Carnet Premium est compris dans le Live Club, le 10% Club, la Formation,
// ETM et le VIP. Un membre qui l'a déjà lisait « Tout est déjà ouvert » et
// n'avait aucun moyen de payer s'il voulait soutenir le projet. Sous « Tout est
// déjà ouvert », une ligne discrète « Soutenir le Carnet » se déplie : le prix
// (celui de l'abonnement, aucun produit neuf), trois effets, un bouton sobre.
// Le journal vend l'abonnement Carnet Premium existant marqué « soutien »
// (`/api/carnet/soutien`) ; le droit ne change pas.
//
// La vente se suggère, elle ne se force pas : pas de fenêtre, pas d'urgence, et
// la ligne ne se montre que si le Premium est déjà compris. Un membre qui
// soutient lit « Tu soutiens le Carnet. Merci. » à la place de la ligne.
//
// Ce fichier est pur (aucun import) : tests/soutien-carnet.test.ts le teste avec Node seul.

export type EtatSoutien = {
  /** Le Premium vient d'une formule (Live Club, 10% Club, Formation, ETM, VIP, accès donné). */
  compris: boolean
  /** La vente du soutien est ouverte à ce compte. */
  ouvert: boolean
  /** Un abonnement de soutien actif ; null quand Stripe ne s'est pas lu. */
  soutien: boolean | null
  /** Un abonnement Carnet Premium actif, soutien ou non ; null quand illisible. */
  actif: boolean | null
  /** Le portail Stripe pour gérer ou arrêter le soutien. */
  portail: string | null
  /** Les prix de l'abonnement (5,99 par mois, 57,50 à l'année). */
  offres: { mois: number; an: number }
}

export const TARIFS_SOUTIEN = { mois: 5.99, an: 57.5 } as const

const objet = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const nombre = (v: unknown, defaut: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : defaut)
const boolOuNull = (v: unknown) => (typeof v === 'boolean' ? v : null)

/** La réponse de GET /api/carnet/soutien, ou null quand elle ne se lit pas. */
export function lireEtatSoutien(valeur: unknown): EtatSoutien | null {
  const brut = objet(valeur)
  if (!brut || brut.ok !== true) return null
  const offres = objet(brut.offres)
  const portail = typeof brut.portail === 'string' && /^https:\/\//.test(brut.portail) ? brut.portail : null
  return {
    compris: brut.compris === true,
    ouvert: brut.ouvert === true,
    soutien: boolOuNull(brut.soutien),
    actif: boolOuNull(brut.actif),
    portail,
    offres: { mois: nombre(offres?.mois, TARIFS_SOUTIEN.mois), an: nombre(offres?.an, TARIFS_SOUTIEN.an) },
  }
}

export type LigneSoutien = 'proposer' | 'merci' | 'rien'

/**
 * Ce que « Mon forfait » montre sous la carte :
 * - `merci` : un abonnement de soutien actif (même si la formule s'est arrêtée) ;
 * - `proposer` : Premium compris par une formule (niveau `club`), vente ouverte,
 *   aucun abonnement Carnet en cours (jamais deux) ;
 * - `rien` sinon : pas compris, abonné ordinaire, Stripe illisible, hors ligne.
 */
export function ligneSoutien(niveau: string | null, etat: EtatSoutien | null): LigneSoutien {
  if (!etat) return 'rien'
  if (etat.soutien === true) return 'merci'
  if (niveau !== 'club') return 'rien'
  if (etat.compris && etat.ouvert && etat.actif === false) return 'proposer'
  return 'rien'
}

export type PeriodeSoutien = 'mois' | 'an'

/** Le refus du journal, dit en une phrase (clé du dictionnaire). */
export function cleRefusSoutien(erreur: unknown): 'soutien.deja' | 'soutien.ferme' | 'soutien.compte' | 'soutien.erreur' {
  if (erreur === 'deja') return 'soutien.deja'
  if (erreur === 'ferme' || erreur === 'pas_compris') return 'soutien.ferme'
  if (erreur === 'compte') return 'soutien.compte'
  return 'soutien.erreur'
}

/** Seule une page de paiement Stripe s'ouvre depuis le Carnet. */
export const urlPaiementSure = (v: unknown): string | null =>
  typeof v === 'string' && /^https:\/\/checkout\.stripe\.com\//.test(v) ? v : null
