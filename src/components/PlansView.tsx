// « Mon forfait » — écran de vente (31/08/2026, refait après retour de Brice).
//
// La v0 du 28/08 annonçait le mentorat comme « bientôt » ; c'était vrai ce
// jour-là et faux depuis la 1.8.1. Ma première reprise était juste sur le fond
// mais ratée sur la forme : quatre cartes de couleurs différentes empilées et
// des paragraphes là où il fallait des coches.
//
// La forme vient maintenant de trois modèles choisis par Brice dans le
// catalogue 21st.dev — « Pricing Card » d'Efferd, « Pricing Plan Card » de
// Cnippet, « Pricing Cards » de prebuiltui. Leur ADN commun :
//   une bascule de période en haut, un PRIX ÉNORME avec le prix barré à côté,
//   une liste courte à coches, un bouton plein sur toute la largeur,
//   un seul accent de couleur et un anneau autour de la carte.
// Le cadenas qui s'ouvre est l'idée de Brice : il dit « ça se débloque » sans
// une seule ligne de texte.
//
// L'écran s'adapte au palier : on ne vend rien à un membre dont l'adhésion
// ouvre déjà tout.
import React, { useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, Check, Loader2, Unlock, ShieldCheck } from 'lucide-react'
import { fetchAccesCaptureIA, type NiveauIA } from '@/lib/sync'
import { getSession } from '@/lib/auth'

// Produit Carnet Premium, compte Stripe AO KNOWLEDGE (acct_1I6dxMEAT4qWdUNV) —
// PAS celui de Mélanie, qui porte le Live Club. Vérifié le 31/08/2026.
//   mensuel : price_1U9QKMEAT4qWdUNVv0OSIusl · 5,99 €/mois
//   annuel  : price_1UAR2CEAT4qWdUNVgqnFaTd8 · 57,50 €/an (-20%)
const OFFRES = {
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

type Periode = keyof typeof OFFRES

/**
 * Le lien de paiement, avec l'email du compte pré-rempli.
 *
 * Ce n'est pas du confort : la reconnaissance de l'abonnement se fait PAR
 * EMAIL côté serveur. Payer avec une autre adresse que celle du compte AOK
 * était le premier moyen de se retrouver avec un abonnement actif et un accès
 * fermé. Pré-remplir supprime la faute avant qu'elle arrive.
 */
function lienPaiement(base: string, email: string | null, userId: string | null): string {
  const url = new URL(base)
  if (email) url.searchParams.set('prefilled_email', email)
  if (userId) url.searchParams.set('client_reference_id', userId)
  return url.toString()
}

const AVANTAGES = [
  'La capture lue par l’IA',
  'Tes graphiques lus à l’image',
  'Tes notes approfondies',
  'Le mentorat qui te répond',
]

function PlansView({ onBack }: { onBack: () => void }) {
  const [niveau, setNiveau] = useState<NiveauIA | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [periode, setPeriode] = useState<Periode>('an')
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    let vivant = true
    Promise.all([fetchAccesCaptureIA(), getSession()])
      .then(([{ acces }, session]) => {
        if (!vivant) return
        if (acces) setNiveau(acces.niveau)
        setEmail(session?.user?.email ?? null)
        setUserId(session?.user?.id ?? null)
      })
      .catch(() => { /* hors ligne : l'offre s'affiche sans personnalisation */ })
      .finally(() => { if (vivant) setChargement(false) })
    return () => { vivant = false }
  }, [])

  const entete = (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={onBack}
        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
        aria-label="Retour"
      >
        <ArrowLeft size={16} />
      </button>
      <BadgeCheck size={16} className="text-purple-500 flex-shrink-0" />
      <h2 className="text-sm font-semibold text-foreground">Mon forfait</h2>
    </div>
  )

  // Une ligne, pas une carte : le gratuit n'a pas à être vendu, juste rassuré.
  const rappelGratuit = (
    <p className="text-[11px] text-muted-foreground leading-relaxed pt-3 border-t border-border">
      Le carnet gratuit reste entier : notes, captures, trades et jugements A/B/C,
      warmups, DOL, dossiers, dictée vocale, exports et sync.
    </p>
  )

  if (chargement) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {entete}
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (niveau === 'club' || niveau === 'premium') {
    const parAdhesion = niveau === 'club'
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {entete}
        <div className="rounded-2xl border border-purple-500/25 bg-purple-500/[0.04] p-5">
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-purple-500/10 mb-3">
            <Unlock size={20} className="text-purple-500" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">
            {parAdhesion ? 'Tout est déjà ouvert' : 'Carnet Premium est actif'}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {parAdhesion
              ? 'Ton accès vient de ton adhésion Ao Knowledge. Tu n’as rien à prendre en plus.'
              : 'Merci — ton abonnement paie les jetons que ton carnet consomme. Le lien de gestion est dans l’email Stripe de confirmation.'}
          </p>
          <ul className="mt-4 space-y-2">
            {AVANTAGES.map(a => (
              <li key={a} className="flex items-start gap-2 text-xs text-foreground/85">
                <Check size={14} className="mt-0.5 flex-shrink-0 text-purple-500" strokeWidth={2.6} />
                {a}
              </li>
            ))}
          </ul>
          <div className="mt-4">{rappelGratuit}</div>
        </div>
      </div>
    )
  }

  const offre = OFFRES[periode]

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
      {entete}

      {/* La carte, anneau compris. Un seul bloc, un seul accent. */}
      <div className="rounded-2xl border border-transparent bg-card p-5 ring-2 ring-purple-500/30">

        {/* Bascule de période, reprise du modèle d'Efferd : c'est elle qui
            porte la remise, et elle est la première chose qu'on voit. */}
        <div className="flex items-center p-0.5 rounded-lg bg-muted mb-5">
          {(['mois', 'an'] as Periode[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriode(p)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                periode === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === 'mois' ? 'Mensuel' : 'Annuel'}
              {p === 'an' && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  −20 %
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Carnet Premium</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400">
            lancement
          </span>
        </div>

        {/* Le prix domine. Le cadenas ouvert à sa hauteur dit ce que ça fait. */}
        <div className="flex items-center gap-2.5 mb-1.5">
          <Unlock size={26} className="text-purple-500 flex-shrink-0" strokeWidth={1.7} />
          <span className="text-[42px] leading-none font-bold tracking-tight text-foreground">
            {offre.montant}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xs text-muted-foreground">{offre.unite}</span>
            {offre.barre && (
              <span className="text-xs text-muted-foreground/60 line-through">{offre.barre}</span>
            )}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-5">{offre.note}</p>

        <ul className="space-y-2.5 mb-5">
          {AVANTAGES.map(a => (
            <li key={a} className="flex items-start gap-2.5 text-[13px] text-foreground/90">
              <Check size={15} className="mt-0.5 flex-shrink-0 text-purple-500" strokeWidth={2.6} />
              {a}
            </li>
          ))}
        </ul>

        <a
          href={lienPaiement(offre.lien, email, userId)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
        >
          <Unlock size={16} strokeWidth={2.2} />
          Débloquer
        </a>

        <p className="flex items-center justify-center gap-1.5 text-[10.5px] text-muted-foreground mt-3">
          <ShieldCheck size={12} className="flex-shrink-0" />
          {email
            ? <>Paiement Stripe · ouvre l’accès sur {email}</>
            : <>Paiement Stripe · connecte-toi d’abord à ton compte AOK</>}
        </p>

        <div className="mt-4">{rappelGratuit}</div>
      </div>
    </div>
  )
}

export default PlansView
