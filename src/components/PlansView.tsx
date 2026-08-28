// « Mon forfait » — v0 (28/08) : l'emplacement existe avant les plans payants.
// Quand Stripe + le gating mentorat arriveront (TODO section 8), cet écran
// affichera le forfait réel lu depuis le backend et le bouton de gestion.
import React from 'react'
import { ArrowLeft, BadgeCheck, GraduationCap, Sparkles } from 'lucide-react'

function PlansView({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
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

      <div className="p-4 border border-green-500/30 bg-green-500/5 rounded-xl mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-600 dark:text-green-400">
            Gratuit
          </span>
          <span className="text-xs text-muted-foreground">ton forfait actuel</span>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">
          Tout le carnet est inclus : notes, captures, trades et jugements A/B/C,
          warmups et cooldowns, DOL, dossiers, dictée vocale, exports et sync vers
          le Journal d'Études. Et ça le restera.
        </p>
      </div>

      <div className="p-4 border border-purple-500/30 bg-purple-500/5 rounded-xl space-y-2">
        <div className="flex items-center gap-2">
          <GraduationCap size={15} className="text-purple-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-foreground">Mode mentorat</p>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400">
            bientôt
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Une option payante en préparation : ton suivi de progression chiffré et un
          plan d'évolution proposé par l'IA puis validé par un mentor humain. Le
          carnet gratuit n'est pas amputé, le mentorat est une surcouche.
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Sparkles size={11} />
          Les forfaits et leur gestion apparaîtront ici à l'ouverture.
        </p>
      </div>
    </div>
  )
}

export default PlansView
