import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import type { TradePrix } from '@/types/academic'
import { t, tp, locale, type CleI18n } from '@/lib/i18n'
import { resumeBroker, type PositionImportee } from '@/lib/positions-jour'

/**
 * « Ma position » (1.8.13, capture c-panneau du labo) : ce que le membre avait
 * prévu (saisi à la main) face à ce que dit le broker (lu dans l'import, en
 * lecture seule). Le prévu reste dans le Carnet et la note du journal ;
 * Pilotage ne lit que la colonne broker.
 */

export const PARTIELS_MAX = 10

type Champ = 'entree' | 'stop' | 'tp' | 'taille' | 'sortie'

const LIGNES: { cle: Champ; label: CleI18n }[] = [
  { cle: 'entree', label: 'prix.entree' },
  { cle: 'stop', label: 'prix.stop' },
  { cle: 'tp', label: 'prix.tp' },
  { cle: 'taille', label: 'prix.taille' },
  { cle: 'sortie', label: 'prix.sortie' },
]

export function ecrireNombre(n: number | undefined): string {
  return n === undefined ? '' : String(n).replace('.', locale() === 'fr-FR' ? ',' : '.')
}

/** Virgule ou point, espaces ignorés ; vide = absent ; null = illisible. */
export function lireNombre(brut: string): number | undefined | null {
  const s = brut.trim().replace(/\s/g, '').replace(',', '.')
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const nombreAffiche = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 6 })

/** « 20 100 -> 20 131 · SL 20 080 · 2 partiels », ou rien. */
export function resumePrevu(prix: TradePrix | undefined): string {
  if (!prix) return ''
  const morceaux: string[] = []
  if (prix.entree !== undefined || prix.sortie !== undefined) {
    morceaux.push([prix.entree, prix.sortie].map(v => (v === undefined ? '?' : nombreAffiche(v))).join(' -> '))
  }
  if (prix.stop !== undefined) morceaux.push(`SL ${nombreAffiche(prix.stop)}`)
  if (prix.tp !== undefined) morceaux.push(`TP ${nombreAffiche(prix.tp)}`)
  if (prix.partiels?.length) morceaux.push(tp('prix.partielsResume1', 'prix.partielsResume', prix.partiels.length))
  return morceaux.join(' · ')
}

type Valeurs = Record<Champ, string>
type LignePartiel = { prix: string; taille: string }

interface TradePrevuBrokerProps {
  prix: TradePrix | undefined
  /** Les positions liées à ce trade (les copies), pour la colonne broker. */
  lies: PositionImportee[]
  ouvert: boolean
  onToggle: () => void
  onSave: (prix: TradePrix | undefined) => void
}

function TradePrevuBroker({ prix, lies, ouvert, onToggle, onSave }: TradePrevuBrokerProps) {
  const [valeurs, setValeurs] = useState<Valeurs>({
    entree: ecrireNombre(prix?.entree),
    stop: ecrireNombre(prix?.stop),
    tp: ecrireNombre(prix?.tp),
    taille: ecrireNombre(prix?.taille),
    sortie: ecrireNombre(prix?.sortie),
  })
  const [partiels, setPartiels] = useState<LignePartiel[]>(
    (prix?.partiels ?? []).map(p => ({ prix: ecrireNombre(p.prix), taille: ecrireNombre(p.taille) })),
  )

  const broker = resumeBroker(lies)
  const valeurBroker = (cle: Champ): { texte: string; absent?: boolean } => {
    if (!broker) return { texte: '-', absent: true }
    switch (cle) {
      case 'entree': return broker.entree === null ? { texte: '-', absent: true } : { texte: nombreAffiche(broker.entree) }
      case 'stop': return broker.stop === null ? { texte: t('prix.nonExporte'), absent: true } : { texte: nombreAffiche(broker.stop) }
      case 'tp': return { texte: t('prix.nonExporte'), absent: true }
      case 'taille': return { texte: broker.comptes > 1 ? `${nombreAffiche(broker.taille)} (${t('prix.xComptes', { n: broker.comptes })})` : nombreAffiche(broker.taille) }
      case 'sortie': return broker.sortie === null
        ? { texte: '-', absent: true }
        : { texte: broker.executions !== null && broker.executions > 2 ? `${nombreAffiche(broker.sortie)} ${t('prix.moy')}` : nombreAffiche(broker.sortie) }
    }
  }

  const lus = LIGNES.map(l => [l.cle, lireNombre(valeurs[l.cle])] as const)
  const partielsLus = partiels.map(p => ({ prix: lireNombre(p.prix), taille: lireNombre(p.taille) }))
  const partielIllisible = (p: { prix: number | undefined | null; taille: number | undefined | null }) =>
    p.prix === null || p.taille === null || (p.prix === undefined && p.taille !== undefined)
  const illisible = lus.some(([, v]) => v === null) || partielsLus.some(partielIllisible)

  const enregistrer = () => {
    if (illisible) return
    const sortie: TradePrix = {}
    for (const [cle, v] of lus) if (typeof v === 'number') sortie[cle] = v
    const gardes = partielsLus
      .filter((p): p is { prix: number; taille: number | undefined } => typeof p.prix === 'number')
      .slice(0, PARTIELS_MAX)
      .map(p => (p.taille === undefined ? { prix: p.prix } : { prix: p.prix, taille: p.taille }))
    if (gardes.length) sortie.partiels = gardes
    onSave(Object.keys(sortie).length ? sortie : undefined)
  }

  if (!ouvert) {
    const resume = resumePrevu(prix)
    return (
      <button onClick={onToggle} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 text-left">
        <ChevronRight size={11} className="text-muted-foreground flex-shrink-0" />
        <span className="text-[11px] text-foreground flex-1 min-w-0">
          {t('prix.maPosition')} · <span className={resume ? '' : 'text-muted-foreground'}>{resume || t('prix.rienSaisi')}</span>
        </span>
      </button>
    )
  }

  const champ = (invalide: boolean) => `w-full min-w-0 px-1.5 py-0.5 text-[11px] bg-muted/40 border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/50 ${invalide ? 'border-red-500/60' : 'border-border'}`
  const colonnes = 'grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-x-1.5 gap-y-1 items-center'
  const entree = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); enregistrer() } }

  return (
    <div className="space-y-1.5">
      <button onClick={onToggle} className="flex items-center gap-1.5">
        <ChevronDown size={11} className="text-muted-foreground" />
        <span className="text-[11px] font-medium text-foreground">{t('prix.maPosition')}</span>
      </button>
      <div className={colonnes}>
        <span />
        <span className="text-[10px] font-medium text-muted-foreground">{t('prix.prevu')}</span>
        <span className="text-[10px] font-medium text-muted-foreground">{t('prix.brokerLie')}</span>
        {LIGNES.map(({ cle, label }) => {
          const b = valeurBroker(cle)
          return (
            <React.Fragment key={cle}>
              <span className="text-[10px] text-muted-foreground">{t(label)}</span>
              <input
                value={valeurs[cle]}
                onChange={e => setValeurs(v => ({ ...v, [cle]: e.target.value }))}
                onKeyDown={entree}
                inputMode="decimal"
                aria-label={t(label)}
                className={champ(lireNombre(valeurs[cle]) === null)}
              />
              <span className={`text-[11px] truncate ${b.absent ? 'text-muted-foreground/70 italic' : 'text-foreground'}`} title={b.texte}>{b.texte}</span>
            </React.Fragment>
          )
        })}
      </div>

      <div className="pt-1 space-y-1">
        <div className={colonnes}>
          <span className="text-[10px] font-medium text-muted-foreground col-span-2">{t('prix.partiels')}</span>
          <span className="text-[10px] text-muted-foreground/70 italic truncate">
            {broker?.executions ? t('prix.executions', { n: broker.executions }) : ''}
          </span>
        </div>
        {partiels.length > 0 && (
          <div className={colonnes}>
            {partiels.map((p, i) => {
              const lu = partielsLus[i]
              return (
                <React.Fragment key={i}>
                  <span className="text-[10px] text-muted-foreground">{t('prix.partielN', { n: i + 1 })}</span>
                  <input
                    value={p.prix}
                    onChange={e => setPartiels(liste => liste.map((x, j) => (j === i ? { ...x, prix: e.target.value } : x)))}
                    onKeyDown={entree}
                    inputMode="decimal"
                    placeholder={t('prix.partielPrix')}
                    aria-label={`${t('prix.partielN', { n: i + 1 })} : ${t('prix.partielPrix')}`}
                    className={champ(lu.prix === null || (lu.prix === undefined && lu.taille !== undefined))}
                  />
                  <span className="flex items-center gap-1 min-w-0">
                    <input
                      value={p.taille}
                      onChange={e => setPartiels(liste => liste.map((x, j) => (j === i ? { ...x, taille: e.target.value } : x)))}
                      onKeyDown={entree}
                      inputMode="decimal"
                      placeholder={t('prix.partielTaille')}
                      aria-label={`${t('prix.partielN', { n: i + 1 })} : ${t('prix.partielTaille')}`}
                      className={champ(lu.taille === null)}
                    />
                    <button
                      onClick={() => setPartiels(liste => liste.filter((_, j) => j !== i))}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted flex-shrink-0"
                      aria-label={t('prix.retirerPartiel')}
                    >
                      <X size={10} />
                    </button>
                  </span>
                </React.Fragment>
              )
            })}
          </div>
        )}
        {partiels.length < PARTIELS_MAX && (
          <button
            onClick={() => setPartiels(liste => [...liste, { prix: '', taille: '' }])}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Plus size={10} />{t('prix.ajouterPartiel')}
          </button>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 pt-0.5">
        <span className="text-[10px] leading-snug text-muted-foreground/70">{t('prix.prevuResteIci')}</span>
        <button
          onClick={enregistrer}
          disabled={illisible}
          className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {t('prix.enregistrer')}
        </button>
      </div>
    </div>
  )
}

export default TradePrevuBroker
