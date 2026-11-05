import React, { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Plus, ScanText, X } from 'lucide-react'
import type { SensTrade, TradePrix, TypeOrdre } from '@/types/academic'
import { t, tp, locale, type CleI18n } from '@/lib/i18n'
import { resumeBroker, type PositionImportee } from '@/lib/positions-jour'
import {
  contratDe, fusionnerLecture, lectureVide, lireNombre as lireNombrePur, prixDepuisTicks, risqueDeduitUSD, sensDuPrix, ticksDepuisPrix,
  type ChampLu, type LectureOrdre, type ModeSaisie, type Saisie,
} from '@/lib/prix-trade'
import type { Quota } from '@/lib/documents-lecture'
import LireCaptureOrdre, { phraseQuotaOrdre } from './LireCaptureOrdre'

/**
 * « Ma position » (1.8.13, capture c-panneau du labo) : ce que le membre avait
 * prévu (saisi à la main) face à ce que dit le broker (lu dans l'import, en
 * lecture seule). Le prévu reste dans le Carnet et la note du journal ;
 * Pilotage ne lit que la colonne broker.
 *
 * 1.8.14 (brief C5, d'après le panneau d'ordre de TradingView) : le sens et le
 * type d'ordre en pastilles, le risque en USD ou en %, le stop et le TP tapés
 * en ticks ou en prix (le prix est ce qu'on garde, converti avec le pas du
 * contrat ; instrument inconnu : pas de ticks), et « Lire une capture » qui
 * remplit la carte par l'IA : les champs remplis sont surlignés, ce que le
 * membre a déjà tapé n'est remplacé que s'il l'accepte, rien n'est enregistré
 * sans « Enregistrer ».
 */

export const PARTIELS_MAX = 10

type Champ = 'entree' | 'stop' | 'tp' | 'taille' | 'risque' | 'sortie'
type CoteTicks = 'stop' | 'tp'

const LIGNES: { cle: Champ; label: CleI18n }[] = [
  { cle: 'entree', label: 'prix.entree' },
  { cle: 'stop', label: 'prix.stop' },
  { cle: 'tp', label: 'prix.tp' },
  { cle: 'taille', label: 'prix.taille' },
  { cle: 'risque', label: 'prix.risque' },
  { cle: 'sortie', label: 'prix.sortie' },
]

const LIBELLE_ORDRE: Record<TypeOrdre, CleI18n> = { marche: 'prix.ordreMarche', limite: 'prix.ordreLimite', stop: 'prix.ordreStop' }
const LIBELLE_SENS: Record<SensTrade, CleI18n> = { achat: 'prix.achat', vente: 'prix.vente' }
const LIBELLE_CHAMP: Record<ChampLu, CleI18n> = {
  sens: 'prix.sens', typeOrdre: 'prix.typeOrdre', entree: 'prix.entree', stop: 'prix.stop', tp: 'prix.tp',
  taille: 'prix.taille', risque: 'prix.risque', partiels: 'prix.partiels',
}

export function ecrireNombre(n: number | undefined): string {
  return n === undefined ? '' : String(n).replace('.', locale() === 'fr-FR' ? ',' : '.')
}

/** Virgule ou point, espaces ignorés ; vide = absent ; null = illisible. */
export const lireNombre = lireNombrePur

export const nombreAffiche = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 6 })

/** « Achat limite · 20 100 -> 20 131 · SL 20 080 · risque 100 USD · 2 partiels », ou rien. */
export function resumePrevu(prix: TradePrix | undefined): string {
  if (!prix) return ''
  const morceaux: string[] = []
  const ordre = prix.typeOrdre ? t(LIBELLE_ORDRE[prix.typeOrdre]) : ''
  const tete = prix.sens ? [t(LIBELLE_SENS[prix.sens]), ordre.toLocaleLowerCase(locale())].filter(Boolean).join(' ') : ordre
  if (tete) morceaux.push(tete)
  if (prix.entree !== undefined || prix.sortie !== undefined) {
    morceaux.push([prix.entree, prix.sortie].map(v => (v === undefined ? '?' : nombreAffiche(v))).join(' -> '))
  }
  if (prix.stop !== undefined) morceaux.push(`SL ${nombreAffiche(prix.stop)}`)
  if (prix.tp !== undefined) morceaux.push(`TP ${nombreAffiche(prix.tp)}`)
  if (prix.risque) morceaux.push(t('prix.risqueResume', { montant: nombreAffiche(prix.risque.montant), unite: prix.risque.unite }))
  if (prix.partiels?.length) morceaux.push(tp('prix.partielsResume1', 'prix.partielsResume', prix.partiels.length))
  return morceaux.join(' · ')
}

function saisieDe(prix: TradePrix | undefined): Saisie {
  return {
    entree: ecrireNombre(prix?.entree),
    stop: ecrireNombre(prix?.stop),
    tp: ecrireNombre(prix?.tp),
    taille: ecrireNombre(prix?.taille),
    sortie: ecrireNombre(prix?.sortie),
    risque: ecrireNombre(prix?.risque?.montant),
    uniteRisque: prix?.risque?.unite ?? 'USD',
    sens: prix?.sens ?? null,
    typeOrdre: prix?.typeOrdre ?? null,
    partiels: (prix?.partiels ?? []).map(p => ({ prix: ecrireNombre(p.prix), taille: ecrireNombre(p.taille) })),
  }
}

const nb = (v: number | undefined | null) => (typeof v === 'number' ? v : undefined)

interface TradePrevuBrokerProps {
  prix: TradePrix | undefined
  /** Les positions liées à ce trade (les copies), pour la colonne broker. */
  lies: PositionImportee[]
  ouvert: boolean
  onToggle: () => void
  onSave: (prix: TradePrix | undefined) => void
  /** L'instrument du trade : son pas de cotation pour les ticks. Inconnu : pas de mode ticks. */
  instrument?: string | null
  /** La capture automatique du lancement du trade (data URL ou adresse), s'il y en a une. */
  captureLancement?: string | null
}

type Resultat = { lecture: LectureOrdre; remplis: number; conflits: ChampLu[]; quota: Quota | null }

function TradePrevuBroker({ prix, lies, ouvert, onToggle, onSave, instrument = null, captureLancement = null }: TradePrevuBrokerProps) {
  const [saisie, setSaisie] = useState<Saisie>(() => saisieDe(prix))
  const [modes, setModes] = useState<Record<CoteTicks, ModeSaisie>>({ stop: 'prix', tp: 'prix' })
  const [surlignes, setSurlignes] = useState<ChampLu[]>([])
  const [lectureOuverte, setLectureOuverte] = useState(false)
  const [resultat, setResultat] = useState<Resultat | null>(null)

  const contrat = contratDe(instrument)
  const broker = resumeBroker(lies)
  const nombre = (c: Champ) => lireNombre(saisie[c])
  const entree = nombre('entree')
  // Le sens qui sert aux ticks : choisi, sinon déduit des champs tapés EN PRIX.
  const sensActuel = sensDuPrix({
    sens: saisie.sens ?? undefined, entree: nb(entree),
    stop: modes.stop === 'prix' ? nb(nombre('stop')) : undefined,
    tp: modes.tp === 'prix' ? nb(nombre('tp')) : undefined,
  })

  /** Le prix d'un stop ou d'un TP, tapé en prix ou converti depuis ses ticks ; undefined = vide, null = illisible. */
  const prixDe = (c: CoteTicks, s: Saisie = saisie): number | undefined | null => {
    const v = lireNombre(s[c])
    if (modes[c] === 'prix' || v === undefined || v === null) return v
    if (!contrat) return null
    return prixDepuisTicks({ entree: nb(lireNombre(s.entree)), ticks: v, pas: contrat.pas, cote: c, sens: sensActuel?.sens }) ?? null
  }

  const surligne = (c: ChampLu) => surlignes.includes(c)
  const oublier = (c: ChampLu) => setSurlignes(l => (l.includes(c) ? l.filter(x => x !== c) : l))
  const changer = (c: Champ, valeur: string) => {
    setSaisie(s => ({ ...s, [c]: valeur }))
    if (c !== 'sortie') oublier(c)
  }

  // ── Ticks ou prix ─────────────────────────────────────────────────────────
  const conversion = (c: CoteTicks): string | null | undefined => {
    if (!contrat) return null
    const v = nombre(c)
    if (v === undefined) return ''
    if (v === null) return null
    if (modes[c] === 'prix') {
      const ticks = ticksDepuisPrix(nb(entree), v, contrat.pas)
      return ticks === null ? null : ecrireNombre(ticks)
    }
    const p = prixDe(c)
    return typeof p === 'number' ? ecrireNombre(p) : null
  }
  const basculer = (c: CoteTicks) => {
    const valeur = conversion(c)
    if (valeur === null || valeur === undefined) return
    setSaisie(s => ({ ...s, [c]: valeur }))
    setModes(m => ({ ...m, [c]: m[c] === 'prix' ? 'ticks' : 'prix' }))
  }

  // ── La lecture d'une capture ─────────────────────────────────────────────
  const appliquer = (lecture: LectureOrdre, remplacer: boolean) => {
    // La lecture rend des PRIX : un stop ou un TP tapé en ticks est d'abord ramené en prix.
    const base: Saisie = { ...saisie }
    const enPrix: Record<CoteTicks, boolean> = { stop: modes.stop === 'prix', tp: modes.tp === 'prix' }
    for (const c of ['stop', 'tp'] as const) {
      if (enPrix[c]) continue
      const p = prixDe(c)
      if (typeof p === 'number') { base[c] = ecrireNombre(p); enPrix[c] = true } else if (p === undefined) enPrix[c] = true
    }
    const r = fusionnerLecture(base, lecture, { ecrire: ecrireNombre, remplacer })
    setSaisie(r.saisie)
    // Un champ en ticks qui n'a pas pu être converti garde ses ticks, sauf si la lecture l'a remplacé.
    setModes({
      stop: enPrix.stop || r.remplis.includes('stop') ? 'prix' : 'ticks',
      tp: enPrix.tp || r.remplis.includes('tp') ? 'prix' : 'ticks',
    })
    return r
  }
  const surLecture = (lecture: LectureOrdre, quota: Quota | null) => {
    const r = appliquer(lecture, false)
    setSurlignes(r.remplis)
    setResultat({ lecture, remplis: r.remplis.length, conflits: r.conflits, quota })
    setLectureOuverte(false)
  }
  const remplacer = () => {
    if (!resultat) return
    const r = appliquer(resultat.lecture, true)
    setSurlignes(l => [...new Set([...l, ...r.remplis])])
    setResultat({ ...resultat, remplis: resultat.remplis + r.remplis.length, conflits: [] })
  }

  // ── Enregistrer ──────────────────────────────────────────────────────────
  const lus: Record<Champ, number | undefined | null> = {
    entree, stop: prixDe('stop'), tp: prixDe('tp'), taille: nombre('taille'), risque: nombre('risque'), sortie: nombre('sortie'),
  }
  const partielsLus = saisie.partiels.map(p => ({ prix: lireNombre(p.prix), taille: lireNombre(p.taille) }))
  const partielIllisible = (p: { prix: number | undefined | null; taille: number | undefined | null }) =>
    p.prix === null || p.taille === null || (p.prix === undefined && p.taille !== undefined)
  const risqueInvalide = saisie.uniteRisque === '%' && typeof lus.risque === 'number' && lus.risque > 100
  const invalide = (c: Champ) => lus[c] === null || (c === 'risque' && risqueInvalide)
  const illisible = LIGNES.some(l => invalide(l.cle)) || partielsLus.some(partielIllisible)
  const ticksSansSens = (['stop', 'tp'] as const).some(c => modes[c] === 'ticks' && lus[c] === null && typeof nombre(c) === 'number')

  const enregistrer = () => {
    if (illisible) return
    const sortie: TradePrix = {}
    for (const c of ['entree', 'stop', 'tp', 'taille', 'sortie'] as const) {
      const v = lus[c]
      if (typeof v === 'number') sortie[c] = v
    }
    if (typeof lus.risque === 'number' && lus.risque > 0) sortie.risque = { montant: lus.risque, unite: saisie.uniteRisque }
    if (saisie.sens) sortie.sens = saisie.sens
    if (saisie.typeOrdre) sortie.typeOrdre = saisie.typeOrdre
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

  const valeurBroker = (cle: Champ): { texte: string; absent?: boolean } => {
    if (!broker) return { texte: '-', absent: true }
    switch (cle) {
      case 'entree': return broker.entree === null ? { texte: '-', absent: true } : { texte: nombreAffiche(broker.entree) }
      case 'stop': return broker.stop === null ? { texte: t('prix.nonExporte'), absent: true } : { texte: nombreAffiche(broker.stop) }
      case 'tp': return { texte: t('prix.nonExporte'), absent: true }
      case 'taille': return { texte: broker.comptes > 1 ? `${nombreAffiche(broker.taille)} (${t('prix.xComptes', { n: broker.comptes })})` : nombreAffiche(broker.taille) }
      case 'risque': return { texte: '-', absent: true }
      case 'sortie': return broker.sortie === null
        ? { texte: '-', absent: true }
        : { texte: broker.executions !== null && broker.executions > 2 ? `${nombreAffiche(broker.sortie)} ${t('prix.moy')}` : nombreAffiche(broker.sortie) }
    }
  }

  const classeChamp = (mauvais: boolean, lu: boolean) =>
    `w-full min-w-0 px-1.5 py-0.5 text-[11px] border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/50 ${
      mauvais ? 'bg-muted/40 border-red-500/60' : lu ? 'bg-purple-500/10 border-purple-500/70' : 'bg-muted/40 border-border'
    }`
  const petitBouton = 'flex-shrink-0 px-1 py-0.5 text-[9px] leading-none rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed'
  const colonnes = 'grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-x-1.5 gap-y-1 items-center'
  const touche = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); enregistrer() } }
  const risqueDeduit = saisie.uniteRisque === 'USD' ? risqueDeduitUSD({ entree: nb(entree), stop: nb(lus.stop), taille: nb(lus.taille) }, contrat) : null

  const pastilleSens = (s: SensTrade) => {
    const choisi = saisie.sens === s
    const deduit = !saisie.sens && sensActuel?.sens === s
    const couleur = s === 'achat'
      ? (choisi ? 'bg-green-500/15 border-green-500/50 text-green-700 dark:text-green-400' : deduit ? 'border-dashed border-green-500/50 text-green-700/80 dark:text-green-400/80' : '')
      : (choisi ? 'bg-red-500/15 border-red-500/50 text-red-700 dark:text-red-400' : deduit ? 'border-dashed border-red-500/50 text-red-700/80 dark:text-red-400/80' : '')
    return (
      <button
        key={s}
        onClick={() => { setSaisie(x => ({ ...x, sens: choisi ? null : s })); oublier('sens') }}
        aria-pressed={choisi}
        title={choisi ? t('prix.sensChoisi') : deduit ? t('prix.sensDeduit') : t('prix.sensChoisir')}
        className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full border transition-colors ${
          couleur || 'border-border text-muted-foreground hover:text-foreground'
        } ${choisi && surligne('sens') ? 'ring-1 ring-purple-500/70' : ''}`}
      >
        {s === 'achat' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{t(LIBELLE_SENS[s])}
      </button>
    )
  }
  const pastilleOrdre = (o: TypeOrdre) => {
    const choisi = saisie.typeOrdre === o
    return (
      <button
        key={o}
        onClick={() => { setSaisie(x => ({ ...x, typeOrdre: choisi ? null : o })); oublier('typeOrdre') }}
        aria-pressed={choisi}
        title={t('prix.typeOrdre')}
        className={`px-1.5 py-0.5 text-[10px] rounded-full border transition-colors ${
          choisi ? 'bg-foreground/10 border-foreground/30 text-foreground font-medium' : 'border-border text-muted-foreground hover:text-foreground'
        } ${choisi && surligne('typeOrdre') ? 'ring-1 ring-purple-500/70' : ''}`}
      >
        {t(LIBELLE_ORDRE[o])}
      </button>
    )
  }

  const champPrix = (cle: Champ, label: CleI18n) => {
    const input = (extra = '') => (
      <input
        value={saisie[cle]}
        onChange={e => changer(cle, e.target.value)}
        onKeyDown={touche}
        inputMode="decimal"
        aria-label={t(label)}
        placeholder={cle === 'risque' && risqueDeduit !== null ? `~ ${nombreAffiche(risqueDeduit)}` : (cle === 'stop' || cle === 'tp') && modes[cle] === 'ticks' ? t('prix.ticks') : undefined}
        title={cle === 'risque' && risqueDeduit !== null ? t('prix.risqueDeduit', { montant: nombreAffiche(risqueDeduit) }) : undefined}
        className={`${classeChamp(invalide(cle), cle !== 'sortie' && surligne(cle))} ${extra}`}
        data-champ={cle}
      />
    )
    if (cle === 'risque') {
      return (
        <span className="flex items-center gap-1 min-w-0">
          {input()}
          <button
            onClick={() => { setSaisie(s => ({ ...s, uniteRisque: s.uniteRisque === 'USD' ? '%' : 'USD' })); oublier('risque') }}
            className={petitBouton}
            title={t('prix.uniteRisque')}
            aria-label={t('prix.uniteRisque')}
          >
            {saisie.uniteRisque === 'USD' ? 'USD' : '%'}
          </button>
        </span>
      )
    }
    if ((cle === 'stop' || cle === 'tp') && contrat) {
      const mode = modes[cle]
      const converti = mode === 'ticks' ? lus[cle] : null
      const prete = conversion(cle)
      return (
        <span className="flex items-center gap-1 min-w-0">
          <span className="relative flex-1 min-w-0">
            {input(mode === 'ticks' ? 'pr-9' : '')}
            {typeof converti === 'number' && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none" data-prix-converti={cle}>
                {nombreAffiche(converti)}
              </span>
            )}
          </span>
          <button
            onClick={() => basculer(cle)}
            disabled={prete === null || prete === undefined}
            className={petitBouton}
            title={prete === null ? t('prix.ticksImpossible') : t('prix.basculerTicks', { pas: nombreAffiche(contrat.pas), instrument: contrat.racine })}
            aria-label={t('prix.basculerTicks', { pas: nombreAffiche(contrat.pas), instrument: contrat.racine })}
            data-bascule={cle}
          >
            {mode === 'ticks' ? t('prix.uniteTicks') : t('prix.unitePrix')}
          </button>
        </span>
      )
    }
    return input()
  }

  const texteResultat = (r: Resultat) => {
    if (lectureVide(r.lecture)) return t('ordre.rienLu')
    if (r.remplis === 0 && r.conflits.length === 0) return t('ordre.dejaLa')
    const base = r.remplis === 0 ? t('ordre.rienRempli') : tp('ordre.rempli1', 'ordre.rempli', r.remplis)
    return r.lecture.instrument ? `${base} ${t('ordre.instrumentLu', { instrument: r.lecture.instrument })}` : base
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button onClick={onToggle} className="flex items-center gap-1.5">
          <ChevronDown size={11} className="text-muted-foreground" />
          <span className="text-[11px] font-medium text-foreground">{t('prix.maPosition')}</span>
        </button>
        {!lectureOuverte && (
          <button
            onClick={() => { setLectureOuverte(true); setResultat(null) }}
            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors"
            title={t('ordre.boutonAide')}
          >
            <ScanText size={11} />{t('ordre.bouton')}
          </button>
        )}
      </div>

      {lectureOuverte && (
        <LireCaptureOrdre captureLancement={captureLancement} onLecture={surLecture} onFermer={() => setLectureOuverte(false)} />
      )}

      {resultat && (
        <div className="rounded-md border border-purple-500/25 bg-purple-500/5 px-2 py-1 space-y-0.5" data-ordre-resultat>
          <p className="text-[10px] leading-snug text-foreground">{texteResultat(resultat)}</p>
          {resultat.conflits.length > 0 && (
            <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">
              {t('ordre.conflits', { champs: resultat.conflits.map(c => t(LIBELLE_CHAMP[c]).toLocaleLowerCase(locale())).join(', ') })}{' '}
              <button onClick={remplacer} className="font-medium text-primary hover:underline">{t('ordre.remplacer')}</button>
            </p>
          )}
          {resultat.lecture.remarque && <p className="text-[10px] leading-snug text-muted-foreground italic">{resultat.lecture.remarque}</p>}
          {phraseQuotaOrdre(resultat.quota) && <p className="text-[10px] text-muted-foreground">{phraseQuotaOrdre(resultat.quota)}</p>}
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap" data-pastilles-ordre>
        {(['achat', 'vente'] as const).map(pastilleSens)}
        <span className="w-px h-3 bg-border mx-0.5" aria-hidden="true" />
        {(['marche', 'limite', 'stop'] as const).map(pastilleOrdre)}
      </div>

      <div className={colonnes}>
        <span />
        <span className="text-[10px] font-medium text-muted-foreground">{t('prix.prevu')}</span>
        <span className="text-[10px] font-medium text-muted-foreground">{t('prix.brokerLie')}</span>
        {LIGNES.map(({ cle, label }) => {
          const b = valeurBroker(cle)
          return (
            <React.Fragment key={cle}>
              <span className="text-[10px] text-muted-foreground">{t(label)}</span>
              {champPrix(cle, label)}
              <span className={`text-[11px] truncate ${b.absent ? 'text-muted-foreground/70 italic' : 'text-foreground'}`} title={b.texte}>{b.texte}</span>
            </React.Fragment>
          )
        })}
      </div>
      {ticksSansSens && <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">{t('prix.ticksSansSens')}</p>}

      <div className="pt-1 space-y-1">
        <div className={colonnes}>
          <span className="text-[10px] font-medium text-muted-foreground col-span-2">{t('prix.partiels')}</span>
          <span className="text-[10px] text-muted-foreground/70 italic truncate">
            {broker?.executions ? t('prix.executions', { n: broker.executions }) : ''}
          </span>
        </div>
        {saisie.partiels.length > 0 && (
          <div className={colonnes}>
            {saisie.partiels.map((p, i) => {
              const lu = partielsLus[i]
              const majPartiel = (champ: 'prix' | 'taille', valeur: string) => {
                setSaisie(s => ({ ...s, partiels: s.partiels.map((x, j) => (j === i ? { ...x, [champ]: valeur } : x)) }))
                oublier('partiels')
              }
              return (
                <React.Fragment key={i}>
                  <span className="text-[10px] text-muted-foreground">{t('prix.partielN', { n: i + 1 })}</span>
                  <input
                    value={p.prix}
                    onChange={e => majPartiel('prix', e.target.value)}
                    onKeyDown={touche}
                    inputMode="decimal"
                    placeholder={t('prix.partielPrix')}
                    aria-label={`${t('prix.partielN', { n: i + 1 })} : ${t('prix.partielPrix')}`}
                    className={classeChamp(lu.prix === null || (lu.prix === undefined && lu.taille !== undefined), surligne('partiels'))}
                  />
                  <span className="flex items-center gap-1 min-w-0">
                    <input
                      value={p.taille}
                      onChange={e => majPartiel('taille', e.target.value)}
                      onKeyDown={touche}
                      inputMode="decimal"
                      placeholder={t('prix.partielTaille')}
                      aria-label={`${t('prix.partielN', { n: i + 1 })} : ${t('prix.partielTaille')}`}
                      className={classeChamp(lu.taille === null, surligne('partiels'))}
                    />
                    <button
                      onClick={() => { setSaisie(s => ({ ...s, partiels: s.partiels.filter((_, j) => j !== i) })); oublier('partiels') }}
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
        {saisie.partiels.length < PARTIELS_MAX && (
          <button
            onClick={() => setSaisie(s => ({ ...s, partiels: [...s.partiels, { prix: '', taille: '' }] }))}
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
