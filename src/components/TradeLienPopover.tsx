import React, { useCallback, useEffect, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, FileUp, Link2, Loader2, Unlink, Users } from 'lucide-react'
import type { TradeSegment } from '@/types/academic'
import { t, tp, locale, type CleI18n } from '@/lib/i18n'
import {
  bornesJours, ecartMinutes, instantPosition, nomCompteDePosition, sensDePosition, type PositionImportee, type Portee,
} from '@/lib/positions-jour'
import { candidatsALier, LISTE_COURTE } from '@/lib/lien-trade'
import { sensDuPrix } from '@/lib/prix-trade'
import { delierTrade, demanderConnexion, fetchPositions, lierPositions, lierUnePosition, ouvrirPilotage, type ErreurLien } from '@/lib/pilotage-api'
import type { CompteConnu } from '@/lib/pilotage-comptes'
import { useComptesPilotage } from '@/lib/use-comptes-pilotage'
import { nombreAffiche } from './TradePrevuBroker'
import ImportTradesDialog from './ImportTradesDialog'
import CadrePopoverTrade from './CadrePopoverTrade'
import PastilleInstrument from './PastilleInstrument'

/**
 * Le lien d'un trade de la note avec un trade importé de Pilotage (1.8.16,
 * demande de Brice du 10/11 : l'icône lien remplace la pastille « R ? »).
 *
 * Le mécanisme est celui de la 1.8.13, sorti du panneau « Prix » où il était
 * caché : les trades du broker du JOUR du trade, du même instrument (pastille
 * modifiable), les copies de plusieurs comptes sur une seule ligne, le sens
 * du trade devant puis l'heure la plus proche ; « Lier » pose le lien
 * (segmentRef) sur toutes les copies d'un clic. Lié : le trade du broker
 * (prix, heure, compte) et « Délier ». Jour vide : importer l'export d'ici,
 * ou dans Pilotage. Rien n'est créé côté broker depuis ici, et le lien ne
 * touche pas aux prix tapés : Pilotage est la vérité du broker, le Carnet
 * complète.
 */

interface TradeLienPopoverProps {
  position: { top: number; bottom: number; left: number }
  trade: TradeSegment
  numero: number
  /** L'instrument lu dans la note (adresse du graphique, titre) ; null quand rien ne le dit. */
  instrumentNote: string | null
  /** Les liens lus à l'ouverture de la note : le trade lié, même hors des jours affichés ici. */
  liesNote: PositionImportee[]
  /** undefined : revenir à l'instrument lu dans la note ; '' : aucun filtre. */
  onSaveInstrument: (instrument: string | undefined) => void
  /** Après un lien posé ou retiré : la rangée relit ses liens (l'icône suit). */
  onLiensChange: () => Promise<void>
  onClose: () => void
}

/** Au-delà du jour du trade, combien de lignes au plus. */
const GROUPES_ELARGIS = 8

export const heure = (instant: number) => new Date(instant).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
const jourHeure = (instant: number) => new Date(instant).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const jourLong = (instant: number) => new Date(instant).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit' })
const decalerJours = (instant: number, jours: number) => { const d = new Date(instant); d.setDate(d.getDate() + jours); return d.getTime() }
const memeJour = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

const sens = (p: PositionImportee) => (p.direction === 'long' ? t('prix.sensLong') : p.direction === 'short' ? t('prix.sensShort') : '')

/** « 20 100,25 -> 20 131 », ou rien quand l'export ne donne pas de prix. */
const prixDe = (p: PositionImportee) => (p.prixEntree !== null
  ? `${nombreAffiche(p.prixEntree)}${p.prixSortie !== null ? ` -> ${nombreAffiche(p.prixSortie)}` : ''}`
  : '')

/** « NQZ5 Long 2 · 20 100,25 -> 20 131 » */
function decrirePosition(p: PositionImportee): string {
  const prix = prixDe(p)
  return `${p.symbole} ${sens(p)} ${nombreAffiche(p.quantite)}${prix ? ` · ${prix}` : ''}`.replace(/\s+/g, ' ').trim()
}

const cleGroupe = (g: PositionImportee[]) => g.map(p => p.positionId).join('+')

/** « Lié à : NQZ5 Long 2 · Compte », pour la rangée, ce panneau et « Prix ». */
export function texteDuLien(lies: PositionImportee[], comptes: CompteConnu[]): string {
  if (!lies.length) return ''
  const p = [...lies].sort((a, b) => instantPosition(a) - instantPosition(b))[0]
  const comptesLies = new Set(lies.map(l => l.compteId || l.compte || l.positionId)).size
  const quoi = `${p.symbole} ${sens(p)} ${nombreAffiche(p.quantite)}`.replace(/\s+/g, ' ').trim()
  const compte = nomCompteDePosition(p, comptes)
  return comptesLies > 1 ? t('prix.lieAN', { position: quoi, n: comptesLies })
    : compte ? t('prix.lieA1', { position: quoi, compte })
    : t('prix.lieASeul', { position: quoi })
}

/** L'écart d'une position à l'heure du trade : « à l'heure du trade », « +2 min », « -3 h », ou rien au-delà d'un jour. */
function texteEcart(p: PositionImportee, startedAt: number): string {
  const ecart = ecartMinutes(p, startedAt)
  const signe = ecart > 0 ? '+' : ''
  return ecart === 0 ? t('prix.aLHeure')
    : Math.abs(ecart) < 120 ? t('prix.ecart', { ecart: `${signe}${ecart}` })
    : Math.abs(ecart) < 24 * 60 ? t('prix.ecartHeures', { ecart: `${signe}${Math.round(ecart / 60)}` })
    : ''
}

const CLES_ERREUR: Record<ErreurLien, CleI18n> = {
  'non-connecte': 'prix.nonConnecte',
  introuvable: 'prix.erreurIntrouvable',
  'deja-lie': 'prix.erreurDejaLie',
  'copie-liee': 'prix.erreurCopieLiee',
  reseau: 'prix.erreurReseau',
}

function TradeLienPopover({ position, trade, numero, instrumentNote, liesNote, onSaveInstrument, onLiensChange, onClose }: TradeLienPopoverProps) {
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
  const [toutVoir, setToutVoir] = useState(false)

  const instrument = trade.instrument !== undefined ? (trade.instrument || null) : instrumentNote

  const charger = useCallback(async () => {
    const r = await fetchPositions(portee === 'tout' ? undefined : bornesJours(trade.startedAt, portee))
    if (r.error) { setEtatBroker(r.error); return }
    setPositions(r.positions ?? [])
    setEtatBroker('pret')
  }, [trade.startedAt, portee])

  useEffect(() => { void charger() }, [charger])

  // Le lien : lu dans les jours affichés, sinon dans la lecture de la note (un trade lié un autre jour).
  const liesJour = (positions ?? []).filter(p => p.segmentRef === trade.id)
  const lies = liesJour.length ? liesJour : liesNote

  // 1.8.14 : le sens du trade (choisi dans la carte, sinon déduit du stop) passe devant ; rien n'est masqué.
  const sensTrade = sensDuPrix(trade.prix)?.sens ?? null
  const { groupes: candidats, masques } = candidatsALier(positions ?? [], { startedAt: trade.startedAt, instrument, sens: sensTrade, portee })
  const limite = portee === 0 ? (toutVoir ? candidats.length : LISTE_COURTE) : GROUPES_ELARGIS
  const groupes = candidats.slice(0, limite)
  const autresDuJour = portee === 0 ? candidats.length - groupes.length : 0

  const relire = useCallback(async () => { await Promise.all([charger(), onLiensChange()]) }, [charger, onLiensChange])

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
    if (!r.ok) {
      setAction(null)
      if (r.error === 'deja-lie' && r.autrePositionId) setRemplacement({ cible: groupe, autre: r.autrePositionId })
      setErreurLien(CLES_ERREUR[r.error])
      return
    }
    // Journal pas encore en 1.8.13 : un seul compte lié par trade.
    if (r.ancienJournal && r.liees < r.total) setInfo(t('prix.ancienJournal', { n: r.liees, total: r.total }))
    await relire()
    setAction(null)
  }, [trade.id, relire])

  const delier = useCallback(async () => {
    setAction('delier')
    setErreurLien(null)
    setInfo(null)
    const r = await delierTrade(trade.id, lies.map(p => p.positionId))
    if (!r.ok) { setAction(null); setErreurLien(CLES_ERREUR[r.error ?? 'reseau']); return }
    await relire()
    setAction(null)
  }, [trade.id, lies, relire])

  const nomCompte = (p: PositionImportee) => nomCompteDePosition(p, comptes)

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
    const quand = portee === 0 ? heure(instantPosition(p)) : jourHeure(instantPosition(p))
    const compteSeul = g.length === 1 ? nomCompte(p) : null
    const sensPosition = sensDePosition(p)
    const autreSens = sensTrade !== null && sensPosition !== null && sensPosition !== sensTrade ? t('prix.autreSens') : null
    const ouvert = copiesOuvertes === cle
    return (
      <li key={cle} className="rounded-lg border border-border" data-candidat={cle}>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-foreground truncate" title={decrirePosition(p)}>{decrirePosition(p)}</p>
            <p className="text-[10px] text-muted-foreground truncate">{[quand, texteEcart(p, trade.startedAt), compteSeul, autreSens].filter(Boolean).join(' · ')}</p>
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

  /** Rien d'importé : d'ici (l'export de ce jour), ou dans Pilotage. */
  const aideImport = () => (
    <div className="rounded-lg border border-dashed border-border p-2 space-y-1.5 text-center" data-lien-vide>
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
      <p className="text-[10px] leading-snug text-muted-foreground">
        {t('lien.pilotageAide')}{' '}
        <button onClick={() => ouvrirPilotage('/documents')} className="font-medium text-primary hover:underline">{t('lien.ouvrirPilotage')}</button>
      </p>
    </div>
  )

  const sectionCandidats = () => {
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
        ) : aideImport()}
        {autresDuJour > 0 && (
          <button onClick={() => setToutVoir(true)} className="text-[10px] text-primary hover:underline">
            {tp('lien.voirAutre1', 'lien.voirAutres', autresDuJour)}
          </button>
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

  /** Le trade du broker relié : ce qu'il dit, puis « Délier ». */
  const vueLiee = () => {
    const p = [...lies].sort((a, b) => instantPosition(a) - instantPosition(b))[0]
    const instant = instantPosition(p)
    const quand = memeJour(instant, trade.startedAt) ? heure(instant) : jourHeure(instant)
    const detail = [prixDe(p), t('lien.entreeA', { heure: quand }), texteEcart(p, trade.startedAt)].filter(Boolean).join(' · ')
    const texte = texteDuLien(lies, comptes)
    return (
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2 space-y-1" data-lien-relie>
        <div className="flex items-center gap-1.5">
          <Link2 size={12} className="text-blue-500 flex-shrink-0" />
          <span className="text-[11px] font-medium text-foreground flex-1 min-w-0 truncate" title={texte}>{texte}</span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate" title={detail}>{detail}</p>
        <div className="flex items-start justify-between gap-2 pt-0.5">
          <span className="text-[10px] leading-snug text-muted-foreground/80">{t('lien.relieAide')}</span>
          <button
            onClick={() => void delier()}
            disabled={action !== null}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {action === 'delier' ? <Loader2 size={10} className="animate-spin" /> : <Unlink size={10} />}
            {t('prix.delier')}
          </button>
        </div>
      </div>
    )
  }

  const jour = `${jourLong(trade.startedAt)} ${heure(trade.startedAt)}`
  const titre = lies.length ? t('prix.titreJour', { n: numero, jour }) : t('lien.titre', { n: numero, jour })

  return (
    <CadrePopoverTrade position={position} ariaLabel={titre} onClose={onClose} ecoute={!importOuvert}>
      <div className="flex items-center gap-1.5 min-w-0">
        <Link2 size={13} className="text-blue-500 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{titre}</span>
        <PastilleInstrument instrument={instrument} instrumentNote={instrumentNote} onSave={onSaveInstrument} />
      </div>

      <div className="space-y-1.5">
        {lies.length > 0 ? vueLiee() : sectionCandidats()}
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
    </CadrePopoverTrade>
  )
}

export default TradeLienPopover
