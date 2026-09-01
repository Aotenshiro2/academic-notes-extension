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

export const OFFRES = {
  mois: {
    lien: 'https://buy.stripe.com/fZucN51ma7Iz0vP2wp7ok00',
    montant: '5,99 €',
    unite: '/ mois',
    barre: null as string | null,
    note: 'Sans engagement, résiliable à tout moment.',
  },
  an: {
    lien: 'https://buy.stripe.com/7sY00jaWK6Ev5Q96MF7ok01',
    montant: '4,79 €',
    unite: '/ mois',
    barre: '5,99 €',
    note: '57,50 € facturés une fois par an. Tu économises 14,38 €.',
  },
} as const

export type Periode = keyof typeof OFFRES

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
