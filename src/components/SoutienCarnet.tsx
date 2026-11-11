// « Soutenir le Carnet » (1.9.0) : la ligne discrète sous « Tout est déjà
// ouvert », proposition 1 du labo du soutien retenue par Brice le 11/11/2026.
// Fermée, c'est une ligne avec un cœur. Ouverte : le prix de l'abonnement
// (l'autre rythme dessous, au clic), les trois effets, un bouton sobre (bordure,
// pas de fond plein) et « Tu arrêtes quand tu veux. ». Un membre qui soutient lit
// « Tu soutiens le Carnet. Merci. » à la place, avec le portail pour arrêter.
// Aucune fenêtre, aucune couleur d'alerte. Règles : lib/soutien-carnet.ts.
import React, { useState } from 'react'
import { Award, Check, ChevronRight, ExternalLink, Heart, Loader2, Repeat } from 'lucide-react'
import { t, type CleI18n } from '@/lib/i18n'
import { formatPrix } from '@/lib/offres'
import { demanderSoutien } from '@/lib/soutien-api'
import { ligneSoutien, type EtatSoutien, type PeriodeSoutien } from '@/lib/soutien-carnet'

/** Un onglet : chrome.tabs dans l'extension, window.open ailleurs (démo). */
function ouvrirOnglet(url: string) {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) void chrome.tabs.create({ url })
  else window.open(url, '_blank', 'noopener')
}

const EFFETS: { cle: CleI18n; Icone: typeof Check }[] = [
  { cle: 'soutien.effetRien', Icone: Check },
  { cle: 'soutien.effetContinue', Icone: Repeat },
  { cle: 'soutien.effetBadge', Icone: Award },
]

export function SoutienCarnet({ niveau, etat }: { niveau: string | null; etat: EtatSoutien | null }) {
  const [periode, setPeriode] = useState<PeriodeSoutien>('mois')
  const [enCours, setEnCours] = useState(false)
  const [refus, setRefus] = useState<CleI18n | null>(null)
  const ligne = ligneSoutien(niveau, etat)
  if (ligne === 'rien' || !etat) return null

  if (ligne === 'merci') {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-foreground/85" role="status">
        <Heart size={14} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1 min-w-0">{t('soutien.merci')}</span>
        {etat.portail && (
          <button
            type="button"
            onClick={() => ouvrirOnglet(etat.portail as string)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('soutien.gerer')} <ExternalLink size={11} aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  const mensuel = formatPrix(etat.offres.mois)
  const annuel = formatPrix(etat.offres.an)
  const payer = async () => {
    setEnCours(true)
    setRefus(null)
    const r = await demanderSoutien(periode)
    setEnCours(false)
    if ('url' in r) ouvrirOnglet(r.url)
    else setRefus(r.refus)
  }

  return (
    <details className="group mt-3">
      <summary className="flex items-center gap-2 px-1 py-1 text-xs font-medium text-foreground/85 hover:text-foreground cursor-pointer list-none [&::-webkit-details-marker]:hidden rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <Heart size={14} className="flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="group-open:underline underline-offset-4">{t('soutien.lien')}</span>
        <ChevronRight size={14} className="ml-auto flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="mt-2 rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-base font-bold text-foreground tabular-nums whitespace-nowrap">
            {periode === 'mois' ? t('soutien.parMois', { prix: mensuel }) : t('soutien.parAn', { prix: annuel })}
          </p>
          <button
            type="button"
            onClick={() => setPeriode(p => (p === 'mois' ? 'an' : 'mois'))}
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {periode === 'mois' ? t('soutien.ouParAn', { prix: annuel }) : t('soutien.ouParMois', { prix: mensuel })}
          </button>
        </div>
        <ul className="space-y-1.5">
          {EFFETS.map(({ cle, Icone }) => (
            <li key={cle} className="flex items-start gap-2 text-xs text-foreground/85 leading-relaxed">
              <Icone size={14} className="mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0">{t(cle)}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void payer()}
          disabled={enCours}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60 transition-colors"
        >
          {enCours ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />{t('soutien.ouverture')}</> : t('soutien.bouton')}
        </button>
        {refus && <p className="text-[11px] text-muted-foreground" role="status">{t(refus)}</p>}
        <p className="text-[11px] text-muted-foreground">{t('soutien.arret')}</p>
      </div>
    </details>
  )
}
