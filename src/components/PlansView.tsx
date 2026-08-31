// « Mon forfait » — écran de vente rapide (31/08/2026).
//
// La v0 du 28/08 annonçait le mode mentorat comme « bientôt » et « une option
// payante en préparation ». C'était vrai ce jour-là ; ça ne l'est plus depuis
// la 1.8.1, où le mentorat est livré et Carnet Premium achetable. Un membre y
// lisait donc une promesse là où il y a une offre, sans moyen de la prendre.
//
// Cet écran n'est pas un tableau comparatif : c'est un UPSELL, une seule offre,
// un seul prix, un seul bouton. Un comparatif fait hésiter ; ici la question
// n'est pas « lequel je prends » mais « est-ce que je passe ».
//
// Ce qu'il montre dépend du palier, lu au backend :
//   club    → rien à vendre, son accès vient déjà du Live Club ;
//   premium → il l'a, on le remercie et on lui dit où gérer ;
//   libre   → l'offre.
// Vendre Carnet Premium à un membre du Live Club serait une faute.
import React, { useEffect, useState } from 'react'
import { ArrowLeft, BadgeCheck, GraduationCap, Sparkles, Check, Loader2, ShieldCheck, Lock } from 'lucide-react'
import { fetchAccesCaptureIA, type NiveauIA } from '@/lib/sync'
import { getSession } from '@/lib/auth'

// Produit Carnet Premium, compte Stripe AO KNOWLEDGE (acct_1I6dxMEAT4qWdUNV) —
// PAS celui de Mélanie, qui porte le Live Club. Vérifié le 31/08/2026 :
// prod_V9jniZCCbIJsmV · price_1U9QKMEAT4qWdUNVv0OSIusl · 5,99 EUR/mois
// (surnom « Lancement 5,99/mois ») · plink_1U9QKNEAT4qWdUNVowL5u5Lt actif.
const LIEN_PAIEMENT = 'https://buy.stripe.com/fZucN51ma7Iz0vP2wp7ok00'
const PRIX = '5,99 €'

/**
 * Le lien de paiement, avec l'email du compte pré-rempli.
 *
 * Ce n'est pas du confort : la reconnaissance de l'abonnement se fait PAR
 * EMAIL côté serveur. Payer avec une autre adresse que celle du compte AOK
 * était le premier moyen de se retrouver avec un abonnement actif et un accès
 * fermé. Pré-remplir supprime la faute avant qu'elle arrive.
 *
 * `client_reference_id` voyage aussi : rien ne le lit aujourd'hui, mais il
 * rattache le paiement au compte sans ambiguïté le jour où on en aura besoin.
 */
function lienPaiement(email: string | null, userId: string | null): string {
  const url = new URL(LIEN_PAIEMENT)
  if (email) url.searchParams.set('prefilled_email', email)
  if (userId) url.searchParams.set('client_reference_id', userId)
  return url.toString()
}

const CE_QUE_TU_DEBLOQUES = [
  'La capture lue par l’IA : elle trie la page, garde ce qui compte et te dit ce qu’elle n’a pas pu lire.',
  'Sur un graphique, elle lit la capture d’écran — tes niveaux, tes zones, tes outils de position.',
  '« Approfondir cette note » : ta note relue dans le cadre de la méthode, la lecture écrite dedans.',
  'Le mentorat qui te répond, à partir de tes trades, de tes jugements A/B/C et de tes causes d’erreur.',
]

function PlansView({ onBack }: { onBack: () => void }) {
  const [niveau, setNiveau] = useState<NiveauIA | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
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
      .catch(() => { /* hors ligne : on montre l'offre sans personnalisation */ })
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
      <BadgeCheck size={16} className="text-green-500 flex-shrink-0" />
      <h2 className="text-sm font-semibold text-foreground">Mon forfait</h2>
    </div>
  )

  // Le carnet gratuit, rappelé dans tous les cas : il n'est amputé de rien, et
  // le dire désamorce la crainte que l'upsell soit une réduction déguisée.
  const carnetGratuit = (
    <div className="p-4 border border-green-500/30 bg-green-500/5 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-600 dark:text-green-400">
          Gratuit
        </span>
        <span className="text-xs text-muted-foreground">inclus, et ça le restera</span>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed">
        Notes, captures, trades et jugements A/B/C, warmups et cooldowns, DOL, dossiers,
        dictée vocale, exports et sync vers le Journal d’Études.
      </p>
    </div>
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

  // ── Déjà couvert par le Live Club ────────────────────────────────────────
  if (niveau === 'club') {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {entete}
        <div className="p-4 border border-amber-500/30 bg-amber-500/5 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <GraduationCap size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm font-semibold text-foreground">Tout est déjà ouvert</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ton accès vient de ton adhésion Ao Knowledge : capture IA, approfondissement
            des notes et mentorat sont inclus. Tu n’as rien à prendre en plus.
          </p>
        </div>
        {carnetGratuit}
      </div>
    )
  }

  // ── Déjà abonné à Carnet Premium ─────────────────────────────────────────
  if (niveau === 'premium') {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {entete}
        <div className="p-4 border border-purple-500/30 bg-purple-500/5 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400">
              Carnet Premium
            </span>
            <span className="text-xs text-muted-foreground">ton forfait actuel</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">
            La capture IA, l’approfondissement des notes et le mentorat sont ouverts.
            Merci — ça finance les jetons que ton carnet consomme.
          </p>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Pour changer de moyen de paiement ou arrêter, le lien de gestion est dans
            l’email de confirmation Stripe qu’on t’a envoyé à l’abonnement.
          </p>
        </div>
        {carnetGratuit}
      </div>
    )
  }

  // ── L'offre ──────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
      {entete}

      <div className="p-4 border border-purple-500/40 bg-purple-500/5 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <GraduationCap size={15} className="text-purple-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground">Carnet Premium</p>
        </div>

        {/* Une phrase, une seule, sur ce que ça change. Pas une liste de
            fonctionnalités : la liste vient après, pour ceux qui la veulent. */}
        <p className="text-sm text-foreground/90 leading-relaxed mb-3">
          Ton carnet arrête d’être un tiroir. Il lit ce que tu captures, et il te relit
          quand tu le lui demandes.
        </p>

        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-2xl font-semibold text-foreground">{PRIX}</span>
          <span className="text-xs text-muted-foreground">par mois</span>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400">
            prix de lancement
          </span>
        </div>

        <a
          href={lienPaiement(email, userId)}
          target="_blank"
          rel="noopener noreferrer"
          className="aura-ia w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
        >
          <Sparkles size={15} />
          Passer en Premium
        </a>

        {/* Les trois freins à l'achat, levés sous le bouton plutôt qu'ailleurs :
            qui encaisse, comment on arrête, et le piège de l'email. */}
        <div className="mt-3 space-y-1.5">
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck size={12} className="mt-0.5 flex-shrink-0" />
            Paiement sécurisé par Stripe. Résiliable à tout moment, sans justification.
          </p>
          {email ? (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Check size={12} className="mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
              Ton accès s’ouvrira sur <span className="font-medium text-foreground/80">{email}</span>,
              déjà pré-rempli sur la page de paiement.
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <Lock size={12} className="mt-0.5 flex-shrink-0" />
              Connecte-toi d’abord à ton compte AOKnowledge : l’accès s’ouvre sur l’email
              du paiement, et il doit être le même.
            </p>
          )}
        </div>
      </div>

      <div className="p-4 border border-border rounded-xl">
        <p className="text-xs font-semibold text-foreground mb-2">Ce que ça débloque</p>
        <ul className="space-y-1.5">
          {CE_QUE_TU_DEBLOQUES.map(ligne => (
            <li key={ligne} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
              <Check size={12} className="mt-0.5 flex-shrink-0 text-purple-500" />
              {ligne}
            </li>
          ))}
        </ul>
      </div>

      {carnetGratuit}

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
        Le carnet gratuit n’est amputé de rien. Premium est une surcouche : elle paie les
        jetons que l’IA consomme sur tes captures et tes études.
      </p>
    </div>
  )
}

export default PlansView
