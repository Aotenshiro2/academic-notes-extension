import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Crosshair, Link2, Unlink, Loader2, ChevronDown, ChevronRight, Users, CalendarDays, FileUp } from 'lucide-react'
import type { TradePrix, TradeSegment } from '@/types/academic'
import { t, tp, locale, type CleI18n } from '@/lib/i18n'
import { normaliserInstrument } from '@/lib/instrument'
import {
  bornesJours, dansLesJours, ecartMinutes, filtrerParInstrument, instantPosition, nomCompteDePosition, regrouperCopies, trierParEcart,
  type PositionImportee, type Portee,
} from '@/lib/positions-jour'
import { delierTrade, demanderConnexion, fetchPositions, lierPositions, lierUnePosition, type ErreurLien } from '@/lib/pilotage-api'
import { useComptesPilotage } from '@/lib/use-comptes-pilotage'
import TradePrevuBroker, { nombreAffiche } from './TradePrevuBroker'
import ImportTradesDialog from './ImportTradesDialog'

/**
 * Le panneau d'un trade de la note (pastille « Prix ») : 1.8.12, refait en
 * 1.8.13 d'après le labo du 03/11 (captures b-regle-jour et c-panneau).
 *
 * 1. « Ma position » : le prévu (saisi, reste dans le Carnet) face au broker
 *    (lu dans l'import, Pilotage ne lit que lui) ;
 * 2. « Chez le broker » : les positions importées du JOUR du trade, du même
 *    instrument (pastille modifiable d'un clic), les copies de plusieurs
 *    comptes sur une seule ligne, triées par écart à l'heure du trade ; « Lier »
 *    pose le lien (segmentRef) sur toutes les copies, « Délier » le retire du
 *    trade entier. Rien n'est créé côté broker depuis ici.
 * 3. Jour vide : « Importer l'export de ce jour » ouvre la boîte d'import.
 */

interface TradePrixPopoverProps {
  position: { top: number; bottom: number; left: number }
  trade: TradeSegment
  numero: number
  /** L'instrument lu dans la note (adresse du graphique, titre) ; null quand rien ne le dit. */
  instrumentNote: string | null
  onSave: (prix: TradePrix | undefined) => void
  /** undefined : revenir à l'instrument lu dans la note ; '' : aucun filtre. */
  onSaveInstrument: (instrument: string | undefined) => void
  onClose: () => void
}

const LARGEUR_MAX = 340
const GROUPES_ELARGIS = 8

const heure = (instant: number) => new Date(instant).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
const jourHeure = (instant: number) => new Date(instant).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const jourLong = (instant: number) => new Date(instant).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit' })
const decalerJours = (instant: number, jours: number) => { const d = new Date(instant); d.setDate(d.getDate() + jours); return d.getTime() }

const sens = (p: PositionImportee) => (p.direction === 'long' ? t('prix.sensLong') : p.direction === 'short' ? t('prix.sensShort') : '')

/** « NQZ5 Long 2 · 20 100,25 -> 20 131 » */
function decrirePosition(p: PositionImportee): string {
  const prix = p.prixEntree !== null
    ? ` · ${nombreAffiche(p.prixEntree)}${p.prixSortie !== null ? ` -> ${nombreAffiche(p.prixSortie)}` : ''}`
    : ''
  return `${p.symbole} ${sens(p)} ${nombreAffiche(p.quantite)}${prix}`.replace(/\s+/g, ' ').trim()
}

const cleGroupe = (g: PositionImportee[]) => g.map(p => p.positionId).join('+')

const CLES_ERREUR: Record<ErreurLien, CleI18n> = {
  'non-connecte': 'prix.nonConnecte',
  introuvable: 'prix.erreurIntrouvable',
  'deja-lie': 'prix.erreurDejaLie',
  'copie-liee': 'prix.erreurCopieLiee',
  reseau: 'prix.erreurReseau',
}

function TradePrixPopover({ position, trade, numero, instrumentNote, onSave, onSaveInstrument, onClose }: TradePrixPopoverProps) {
  const etatComptes = useComptesPilotage()
  const comptes = etatComptes.etat === 'pret' ? etatComptes.comptes : []
  const [portee, setPortee] = useState<Portee>(0)
  const [positions, setPositions] = useState<PositionImportee[] | null>(null)
  const [etatBroker, setEtatBroker] = useState<'chargement' | 'pret' | 'non-connecte' | 'reseau'>('chargement')
  const [action, setAction] = useState<string | null>(null)
  const [erreurLien, setErreurLien] = useState<CleI18n | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [remplacement, setRemplacement] = useState<{ cible: PositionImportee[]; autre: string } | null>(null)
  const [copiesOuvertes, setCopiesOuvertes] = useState<string | null>(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [maPosition, setMaPosition] = useState<boolean | null>(null)
  const [editionInstrument, setEditionInstrument] = useState(false)
  const [brouillon, setBrouillon] = useState('')
  const [hauteur, setHauteur] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)

  const instrument = trade.instrument !== undefined ? (trade.instrument || null) : instrumentNote

  const charger = useCallback(async () => {
    const r = await fetchPositions(portee === 'tout' ? undefined : bornesJours(trade.startedAt, portee))
    if (r.error) { setEtatBroker(r.error); return }
    setPositions(r.positions ?? [])
    setEtatBroker('pret')
  }, [trade.startedAt, portee])

  useEffect(() => { void charger() }, [charger])

  // Échap et clic dehors ferment, sauf quand la boîte d'import est ouverte par-dessus.
  useEffect(() => {
    if (importOuvert) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose, importOuvert])

  // La hauteur réelle, pour ne jamais déborder en bas de l'écran.
  useLayoutEffect(() => {
    const el = popupRef.current
    if (!el) return
    const mesurer = () => setHauteur(el.scrollHeight)
    mesurer()
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(el)
    for (const enfant of Array.from(el.children)) observateur.observe(enfant)
    return () => observateur.disconnect()
  }, [])

  const lies = (positions ?? []).filter(p => p.segmentRef === trade.id)
  const libres = (positions ?? []).filter(p => !p.segmentRef && (portee === 'tout' || dansLesJours(p, trade.startedAt, portee)))
  const { gardees, masques } = filtrerParInstrument(libres, instrument)
  const groupesTries = trierParEcart(regrouperCopies(gardees), trade.startedAt)
  const groupes = portee === 0 ? groupesTries : groupesTries.slice(0, GROUPES_ELARGIS)
  // Ouvert par défaut, sauf quand des trades du broker attendent d'être liés (la liste passe devant).
  const ouvertMaPosition = maPosition ?? !(etatBroker === 'pret' && lies.length === 0 && groupes.length > 0)

  const lierGroupe = useCallback(async (groupe: PositionImportee[], remplacer?: string) => {
    setAction(cleGroupe(groupe))
    setErreurLien(null)
    setInfo(null)
    setRemplacement(null)
    if (remplacer) {
      const d = await lierUnePosition(remplacer, null)
      if (!d.ok) { setAction(null); setErreurLien('prix.erreurReseau'); return }
    }
    const r = await lierPositions(groupe.map(p => p.positionId), trade.id)
    setAction(null)
    if (!r.ok) {
      if (r.error === 'deja-lie' && r.autrePositionId) setRemplacement({ cible: groupe, autre: r.autrePositionId })
      setErreurLien(CLES_ERREUR[r.error])
      return
    }
    // Journal pas encore en 1.8.13 : un seul compte lié par trade.
    if (r.ancienJournal && r.liees < r.total) setInfo(t('prix.ancienJournal', { n: r.liees, total: r.total }))
    await charger()
  }, [trade.id, charger])

  const delier = useCallback(async () => {
    setAction('delier')
    setErreurLien(null)
    setInfo(null)
    const r = await delierTrade(trade.id, lies.map(p => p.positionId))
    setAction(null)
    if (!r.ok) { setErreurLien(CLES_ERREUR[r.error ?? 'reseau']); return }
    await charger()
  }, [trade.id, lies, charger])

  const enregistrerInstrument = () => {
    const brut = brouillon.trim()
    const valeur = brut ? (normaliserInstrument(brut) ?? brut.toUpperCase()) : ''
    onSaveInstrument(valeur === (instrumentNote ?? '') ? undefined : valeur)
    setEditionInstrument(false)
  }

  const nomCompte = (p: PositionImportee) => nomCompteDePosition(p, comptes)

  // Placement : sous la pastille, au-dessus quand la place manque, jamais hors de l'écran.
  const largeur = Math.min(LARGEUR_MAX, window.innerWidth - 16)
  const hauteurMax = window.innerHeight - 16
  const h = Math.min(hauteur, hauteurMax)
  let top = position.bottom + 4
  if (top + h > window.innerHeight - 8) {
    const auDessus = position.top - 4 - h
    top = auDessus >= 8 ? auDessus : Math.max(8, window.innerHeight - 8 - h)
  }
  const style: React.CSSProperties = {
    position: 'fixed',
    top,
    left: Math.max(8, Math.min(position.left - largeur / 2, window.innerWidth - largeur - 8)),
    width: largeur,
    maxHeight: hauteurMax,
    overflowY: 'auto',
    zIndex: 9999,
    visibility: hauteur ? 'visible' : 'hidden',
  }

  const ligneJour = () => {
    const quoi = instrument
      ? (trade.instrument !== undefined ? t('prix.choisiParToi', { instrument }) : t('prix.luSurGraphique', { instrument }))
      : t('prix.tousInstruments')
    const quand = portee === 0 ? t('prix.jourDuTrade', { jour: jourLong(trade.startedAt) })
      : portee === 3 ? t('prix.joursAutour', { debut: jourLong(decalerJours(trade.startedAt, -3)), fin: jourLong(decalerJours(trade.startedAt, 3)) })
      : t('prix.tousLesJours')
    return (
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
        <CalendarDays size={10} className="mt-0.5 flex-shrink-0" />
        <span>{quand} · {quoi}</span>
      </div>
    )
  }

  const ligneGroupe = (g: PositionImportee[]) => {
    const p = g[0]
    const cle = cleGroupe(g)
    const ecart = ecartMinutes(p, trade.startedAt)
    const quand = portee === 0 ? heure(instantPosition(p)) : jourHeure(instantPosition(p))
    const signe = ecart > 0 ? '+' : ''
    const ecartTexte = ecart === 0 ? t('prix.aLHeure')
      : Math.abs(ecart) < 120 ? t('prix.ecart', { ecart: `${signe}${ecart}` })
      : Math.abs(ecart) < 24 * 60 ? t('prix.ecartHeures', { ecart: `${signe}${Math.round(ecart / 60)}` })
      : ''
    const compteSeul = g.length === 1 ? nomCompte(p) : null
    const ouvert = copiesOuvertes === cle
    return (
      <li key={cle} className="rounded-lg border border-border">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-foreground truncate" title={decrirePosition(p)}>{decrirePosition(p)}</p>
            <p className="text-[10px] text-muted-foreground truncate">{[quand, ecartTexte, compteSeul].filter(Boolean).join(' · ')}</p>
          </div>
          <button
            onClick={() => void lierGroupe(g)}
            disabled={action !== null}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {action === cle ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
            {g.length > 1 ? t('prix.lierN', { n: g.length }) : t('prix.lier')}
          </button>
        </div>
        {g.length > 1 && (
          <button onClick={() => setCopiesOuvertes(o => (o === cle ? null : cle))} className="w-full flex items-center gap-1 px-2 pb-1 text-[10px] text-muted-foreground hover:text-foreground">
            {ouvert ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <Users size={10} />{t('prix.copies', { n: g.length })}
          </button>
        )}
        {g.length > 1 && ouvert && (
          <ul className="border-t border-border px-2 py-1 space-y-0.5">
            {g.map(c => (
              <li key={c.positionId} className="flex items-center gap-2 text-[10px]">
                <span className="flex-1 text-foreground truncate">{nomCompte(c) ?? t('prix.compteInconnu')}</span>
                <span className="text-muted-foreground flex-shrink-0">
                  {heure(instantPosition(c))}{c.prixEntree !== null ? ` · ${nombreAffiche(c.prixEntree)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  const sectionBroker = () => {
    if (etatBroker === 'chargement') {
      return <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 size={10} className="animate-spin" />{t('prix.chargement')}</p>
    }
    if (etatBroker === 'non-connecte') {
      return (
        <div className="space-y-1">
          <p className="text-[10px] leading-snug text-muted-foreground">{t('prix.nonConnecte')}</p>
          <button onClick={() => { demanderConnexion(); onClose() }} className="text-[10px] font-medium text-primary hover:underline">{t('prix.meConnecter')}</button>
        </div>
      )
    }
    if (etatBroker === 'reseau') return <p className="text-[10px] leading-snug text-muted-foreground">{t('prix.erreurReseau')}</p>
    const nMasques = masques.reduce((total, m) => total + m.n, 0)
    const listeMasques = masques.map(m => m.famille).join(', ')
    return (
      <>
        {ligneJour()}
        {groupes.length > 0 ? (
          <ul className="space-y-1">{groupes.map(ligneGroupe)}</ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-2 space-y-1.5 text-center">
            <p className="text-[10px] text-muted-foreground">
              {portee === 0 ? t('prix.rienCeJour', { jour: jourLong(trade.startedAt) }) : t('prix.rienCesJours')}
            </p>
            {portee === 0 && (
              <button
                onClick={() => setImportOuvert(true)}
                className="w-full flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <FileUp size={11} />{t('prix.importerJour')}
              </button>
            )}
          </div>
        )}
        <div className="flex items-start justify-between gap-2 text-[10px]">
          <span className="text-muted-foreground">
            {nMasques > 0 ? (portee === 0
              ? tp('prix.masque1', 'prix.masque', nMasques, { liste: listeMasques })
              : tp('prix.masqueJours1', 'prix.masqueJours', nMasques, { liste: listeMasques })) : ''}
          </span>
          <button
            onClick={() => setPortee(p => (p === 0 ? 3 : p === 3 ? 'tout' : 0))}
            className="text-primary hover:underline flex-shrink-0 text-right"
          >
            {portee === 0 ? t('prix.voirAutresJours') : portee === 3 ? t('prix.voirTout') : t('prix.revenirJour')}
          </button>
        </div>
      </>
    )
  }

  const ligneLie = () => {
    const p = [...lies].sort((a, b) => instantPosition(a) - instantPosition(b))[0]
    const comptesLies = new Set(lies.map(l => l.compteId || l.compte || l.positionId)).size
    const quoi = `${p.symbole} ${sens(p)} ${nombreAffiche(p.quantite)}`.replace(/\s+/g, ' ').trim()
    const compte = nomCompte(p)
    const texte = comptesLies > 1 ? t('prix.lieAN', { position: quoi, n: comptesLies })
      : compte ? t('prix.lieA1', { position: quoi, compte })
      : t('prix.lieASeul', { position: quoi })
    return (
      <div className="flex items-center gap-2">
        <Link2 size={12} className="text-blue-500 flex-shrink-0" />
        <span className="text-[11px] font-medium text-foreground flex-1 min-w-0 truncate" title={texte}>{texte}</span>
        <button
          onClick={() => void delier()}
          disabled={action !== null}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {action === 'delier' ? <Loader2 size={10} className="animate-spin" /> : <Unlink size={10} />}
          {t('prix.delier')}
        </button>
      </div>
    )
  }

  const titre = t('prix.titreJour', { n: numero, jour: `${jourLong(trade.startedAt)} ${heure(trade.startedAt)}` })

  return (
    <div
      ref={popupRef}
      style={style}
      className="bg-background border border-border rounded-xl shadow-lg p-3 space-y-2.5"
      onMouseDown={e => e.stopPropagation()}
      role="dialog"
      aria-label={titre}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Crosshair size={13} className="text-blue-500 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{titre}</span>
        {editionInstrument ? (
          <input
            autoFocus
            value={brouillon}
            onChange={e => setBrouillon(e.target.value.toUpperCase())}
            onBlur={enregistrerInstrument}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); enregistrerInstrument() }
              if (e.key === 'Escape') { e.stopPropagation(); setEditionInstrument(false) }
            }}
            placeholder={t('prix.instrumentPlaceholder')}
            aria-label={t('prix.instrumentAide')}
            className="w-16 px-1.5 py-0 text-[10px] text-center bg-muted/40 border border-border rounded-full focus:outline-none focus:border-primary/50"
          />
        ) : (
          <button
            onClick={() => { setBrouillon(instrument ?? ''); setEditionInstrument(true) }}
            className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 transition-colors ${
              instrument ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border border-dashed border-muted-foreground/60 text-muted-foreground hover:text-foreground'
            }`}
            title={t('prix.instrumentAide')}
            aria-label={t('prix.instrumentAide')}
          >
            {instrument ?? t('prix.instrumentTous')}
          </button>
        )}
      </div>

      <TradePrevuBroker
        prix={trade.prix}
        lies={lies}
        ouvert={ouvertMaPosition}
        onToggle={() => setMaPosition(!ouvertMaPosition)}
        onSave={prix => { onSave(prix); onClose() }}
      />

      <div className="border-t border-border pt-2 space-y-1.5">
        {etatBroker === 'pret' && lies.length > 0 ? ligneLie() : (
          <>
            <div className="flex items-center gap-1.5">
              <Link2 size={12} className="text-muted-foreground" />
              <span className="text-[11px] font-medium text-foreground">{t('prix.chezBroker')}</span>
            </div>
            {sectionBroker()}
          </>
        )}
        {info && <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">{info}</p>}
        {erreurLien && <p className="text-[10px] leading-snug text-red-600 dark:text-red-400">{t(erreurLien)}</p>}
        {remplacement && (
          <button
            onClick={() => void lierGroupe(remplacement.cible, remplacement.autre)}
            disabled={action !== null}
            className="w-full px-2 py-1 text-[10px] font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            {t('prix.remplacer')}
          </button>
        )}
      </div>

      {importOuvert && (
        <ImportTradesDialog
          jour={trade.startedAt}
          onClose={() => setImportOuvert(false)}
          onRange={() => { void charger() }}
        />
      )}
    </div>
  )
}

export default TradePrixPopover
