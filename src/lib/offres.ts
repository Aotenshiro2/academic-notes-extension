// L'offre Carnet Premium, en un seul endroit (31/08/2026).
//
// Le prix vivait en double : dans « Mon forfait » et, en dur, dans la carte
// d'upsell du mentorat. Les deux avaient déjà divergé — le mentorat ne
// connaissait que le mensuel et envoyait vers un lien de paiement SANS l'email
// pré-rempli, ce qui est précisément le moyen de se retrouver abonné et bloqué.
// Un seul fichier porte donc l'offre, et un seul écran vend.
//
// Produit Carnet Premium, compte Stripe AO KNOWLEDGE (acct_1I6dxMEAT4qWdUNV) —
// PAS celui de Mélanie, qui porte le Live Club. Vérifié le 31/08/2026.
//   mensuel : price_1U9QKMEAT4qWdUNVv0OSIusl · 5,99 €/mois
//   annuel  : price_1UAR2CEAT4qWdUNVgqnFaTd8 · 57,50 €/an (-20%)
//
// Les montants sont des NOMBRES depuis le 01/10/2026 (traduction anglaise) :
// « 5,99 € » s'écrit « €5.99 » en anglais, et c'est formatPrix qui décide.
// Les textes qui accompagnent l'offre vivent dans le dictionnaire (i18n.ts,
// clés `forfait.*`).
import { getLangue, locale } from './i18n'

export const OFFRES = {
  mois: {
    lien: 'https://buy.stripe.com/fZucN51ma7Iz0vP2wp7ok00',
    /** prix affiché, par mois */
    prix: 5.99,
    /** prix barré à côté, s'il y en a un */
    barre: null as number | null,
    /** total facturé par an et économie, pour la formule annuelle seulement */
    totalAn: null as number | null,
    economie: null as number | null,
  },
  an: {
    lien: 'https://buy.stripe.com/7sY00jaWK6Ev5Q96MF7ok01',
    // 57,50 € par an ramenés au mois
    prix: 4.79,
    barre: 5.99 as number | null,
    totalAn: 57.5 as number | null,
    // 12 x 5,99 € = 71,88 €, moins 57,50 €
    economie: 14.38 as number | null,
  },
}

export type Periode = keyof typeof OFFRES

/**
 * Un montant en euros, tel qu'on l'affiche.
 *
 * En français, l'écriture d'origine à l'octet près (« 5,99 € », espace
 * simple) : Intl y mettrait une espace insécable étroite et changerait le
 * rendu déjà en production. Les autres langues passent par Intl, qui sait où
 * se place le symbole (« €5.99 » en anglais).
 */
export function formatPrix(montant: number): string {
  if (getLangue() === 'fr') return `${montant.toFixed(2).replace('.', ',')} €`
  try {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(montant)
  } catch {
    return `€${montant.toFixed(2)}`
  }
}

/**
 * Le lien de paiement, avec l'email du compte pré-rempli.
 *
 * Ce n'est pas du confort : la reconnaissance de l'abonnement se fait PAR
 * EMAIL côté serveur. Payer avec une autre adresse que celle du compte AOK
 * était le premier moyen de se retrouver avec un abonnement actif et un accès
 * fermé. Pré-remplir supprime la faute avant qu'elle arrive.
 */
export function lienPaiement(base: string, email: string | null, userId: string | null): string {
  const url = new URL(base)
  if (email) url.searchParams.set('prefilled_email', email)
  if (userId) url.searchParams.set('client_reference_id', userId)
  return url.toString()
}
