import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CandlestickChart, X, Check, AlertCircle, Loader2, ExternalLink, Link2 } from 'lucide-react'
import { t, tp, locale } from '@/lib/i18n'
import { type Lecture, type Quota } from '@/lib/documents-lecture'
import { abregerIdentifiant, adresseNouveauCompte, comptesProposes, libelleCompte } from '@/lib/documents-attribution'
import {
  annoncerTradesRanges, apercuImport, comptesEnvoyes, confirmerImport, demanderConnexion, demanderRelectureComptesPilotage,
  fuseauDuNavigateur, lireDocument, ouvrirPilotage, type ApercuImport, type LigneApercu,
} from '@/lib/pilotage-api'
import { useComptesPilotage } from '@/lib/use-comptes-pilotage'
import { marquerLue, type DemandeTradesPage } from '@/lib/use-trades-page'
import { compteDepuisPage, lectureATrades, lotsDeLaCapture, nomDeCapture, sourceCapture, type LotCapture } from '@/lib/trades-page'
import { phraseQuota } from './ImportTradesDialog'
import type { CompteConnu } from '@/lib/pilotage-comptes'

/**
 * « Les trades de cette page » (1.10.0) : la capture intelligente d'une page
 * de plateforme range ses trades dans Pilotage, comme un import.
 *
 * 1. La capture d'écran part à la lecture de Pilotage (`documents/lire`,
 *    mêmes paliers et quotas, gardée au coffre comme un document déposé).
 * 2. Les trades fermés lus sont montrés en aperçu (instrument, sens,
 *    quantité, prix, date, P&L), avec ceux que le journal connaît déjà sur ce
 *    compte, écartés et dits.
 * 3. Le compte est celui que la page montre, sinon celui que la lecture
 *    devine ; « Quel compte ? » en cas de doute.
 * 4. Rien n'entre sans « Ranger » : le même import que Pilotage
 *    (`trades/import`, même `compteId`), et « Lier » rattache ensuite ces
 *    trades à ceux des notes.
 */

interface Props {
  demande: DemandeTradesPage
  onClose: () => void
}

type Etape = 'lecture' | 'erreur' | 'sans-trades' | 'apercu' | 'rangement' | 'rapport'
type EtatApercu = { etat: 'chargement' } | { etat: 'pret'; apercu: ApercuImport } | { etat: 'erreur'; message: string }
type Bilan = { compteId: string; importes: number; deja: number; liees: number; erreur?: string }

/** La lecture de Pilotage ne rend pas plus de 25 trades d'une capture (LIGNES_MAX_IA du journal). */
const TRADES_MAX_PAR_LECTURE = 25

const montant = (n: number | null, devise?: string) => {
  if (n === null || !Number.isFinite(n)) return '-'
  const texte = n.toLocaleString(locale(), { maximumFractionDigits: 2 })
  return devise ? `${n > 0 ? '+' : ''}${texte} ${devise}` : texte
}
const quand = (iso: string) => new Date(iso).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function TradesDeLaPage({ demande, onClose }: Props) {
  const etatComptes = useComptesPilotage()
  const comptes: CompteConnu[] = etatComptes.etat === 'pret' ? etatComptes.comptes : []
  const [etape, setEtape] = useState<Etape>(demande.directs?.length ? 'apercu' : 'lecture')
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [message, setMessage] = useState<{ texte: string; connexion?: boolean } | null>(null)
  const [quota, setQuota] = useState<Quota | null>(null)
  const [choix, setChoix] = useState<Record<string, string>>({})
  const [changer, setChanger] = useState<Record<string, boolean>>({})
  const [apercus, setApercus] = useState<Record<string, EtatApercu>>({})
  const apercusDemandes = useRef<Set<string>>(new Set())
  const [bilans, setBilans] = useState<Bilan[]>([])
  const lectureLancee = useRef(false)
  const fuseau = useMemo(fuseauDuNavigateur, [])
  const nomDocument = useMemo(() => nomDeCapture(Date.now()), [])
  const source = useMemo(() => sourceCapture(demande.url), [demande.url])

  // Les comptes de Pilotage relus au geste (règle du 05/11), comme la boîte d'import.
  useEffect(() => {
    void demanderRelectureComptesPilotage()
    const auRetour = () => { void demanderRelectureComptesPilotage() }
    window.addEventListener('focus', auRetour)
    return () => window.removeEventListener('focus', auRetour)
  }, [])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape' && etape !== 'rangement') onClose() }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [onClose, etape])

  // 1. La lecture de la capture, une fois, dès que les comptes sont là.
  useEffect(() => {
    if (lectureLancee.current || demande.directs?.length || etatComptes.etat === 'chargement') return
    lectureLancee.current = true
    const type = /^data:([^;,]+)/.exec(demande.image)?.[1] ?? 'image/jpeg'
    void lireDocument({ nom: nomDocument, type, data: demande.image, comptes: comptesEnvoyes(comptes) }).then(r => {
      if (r.quota) setQuota(r.quota)
      if (!r.ok) {
        setMessage(r.erreur === 'non-connecte' ? { texte: t('import.nonConnecte'), connexion: true }
          : r.erreur === 'epuisees' ? { texte: t('tradesPage.epuisees') }
          : r.erreur === 'trop-lourd' ? { texte: t('import.tropLourd') }
          : { texte: r.message ?? t('tradesPage.erreur') })
        setEtape('erreur')
        return
      }
      void marquerLue(demande.empreinte)
      setLecture(r.lecture ?? null)
      setEtape(lectureATrades(r.lecture) ? 'apercu' : 'sans-trades')
    })
  }, [demande, etatComptes.etat, comptes, nomDocument])

  // 2. Les lots, un par compte lu ; le compte d'après la page, sinon la lecture.
  const lots = useMemo<LotCapture[]>(() => lotsDeLaCapture({
    lecture,
    directs: demande.directs,
    comptes,
    page: comptes.length ? compteDepuisPage(demande.releve, comptes) : null,
    source,
  }), [lecture, demande, comptes, source])

  const compteDuLot = useCallback((lot: LotCapture): string | null => {
    const choisi = choix[lot.cle]
    if (choisi === 'aucun') return null
    const id = choisi ?? lot.devinette.compteId
    return id && comptes.some(c => c.id === id) ? id : null
  }, [choix, comptes])

  // 3. L'aperçu du journal pour chaque lot et son compte : nouveaux, déjà importés.
  useEffect(() => {
    for (const lot of lots) {
      const compteId = compteDuLot(lot) ?? ''
      const cle = `${lot.cle}|${compteId}`
      if (apercusDemandes.current.has(cle)) continue
      apercusDemandes.current.add(cle)
      setApercus(a => ({ ...a, [cle]: { etat: 'chargement' } }))
      void apercuImport({ trades: lot.trades, source: lot.source, fichier: nomDocument, compteId, fuseau }).then(r => {
        setApercus(a => ({ ...a, [cle]: r.ok ? { etat: 'pret', apercu: r.valeur! } : { etat: 'erreur', message: r.message ?? t('tradesPage.erreur') } }))
      })
    }
  }, [lots, compteDuLot, fuseau, nomDocument])

  const apercuDuLot = (lot: LotCapture): EtatApercu | undefined => apercus[`${lot.cle}|${compteDuLot(lot) ?? ''}`]
  const nomCompte = (id: string | null) => {
    const compte = id ? comptes.find(c => c.id === id) : undefined
    return compte ? libelleCompte(compte) : ''
  }

  const aRanger = lots.reduce((total, lot) => {
    const a = apercuDuLot(lot)
    return total + (compteDuLot(lot) && a?.etat === 'pret' ? a.apercu.nouveaux : 0)
  }, 0)
  const apercuEnCours = lots.some(lot => apercuDuLot(lot)?.etat !== 'pret' && apercuDuLot(lot)?.etat !== 'erreur')
  const sansCompte = lots.filter(lot => !compteDuLot(lot) && choix[lot.cle] !== 'aucun').length
  const lus = lots.reduce((n, lot) => n + lot.trades.length, 0)

  const ranger = async () => {
    setEtape('rangement')
    const resultats: Bilan[] = []
    for (const lot of lots) {
      const compteId = compteDuLot(lot)
      const a = apercuDuLot(lot)
      if (!compteId || a?.etat !== 'pret' || a.apercu.lus === 0) continue
      if (a.apercu.nouveaux === 0) { resultats.push({ compteId, importes: 0, deja: a.apercu.dejaConnus, liees: 0 }); continue }
      const r = await confirmerImport({ trades: lot.trades, source: lot.source, fichier: nomDocument, compteId, fuseau })
      if (!r.ok) {
        resultats.push({ compteId, importes: 0, deja: 0, liees: 0, erreur: r.erreur === 'non-connecte' ? t('import.nonConnecte') : r.message ?? t('tradesPage.erreur') })
        continue
      }
      resultats.push({ compteId, importes: r.valeur!.importes, deja: r.valeur!.dejaConnus, liees: r.valeur!.liees })
    }
    setBilans(resultats)
    setEtape('rapport')
    if (resultats.some(b => b.importes > 0)) annoncerTradesRanges()
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const ligneCompte = (lot: LotCapture) => {
    const compteId = compteDuLot(lot)
    const choisi = choix[lot.cle] !== undefined
    const montrerChoix = changer[lot.cle] || (!choisi && (lot.devinette.doute || !compteId))
    if (montrerChoix || !compteId) {
      const valeur = choix[lot.cle] ?? lot.devinette.compteId ?? ''
      return (
        <div className="space-y-1">
          {lot.devinette.inconnu && !choisi && (
            <div className="space-y-1">
              <p className="text-[11px] text-foreground">{t('import.inconnu', { compte: abregerIdentifiant(lot.devinette.inconnu.identifiant) })}</p>
              <button
                onClick={() => ouvrirPilotage(adresseNouveauCompte(lot.devinette.inconnu!))}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/40 text-[10px] font-medium text-primary hover:bg-primary/10"
              >
                <ExternalLink size={10} />{t('import.creerCompte')}
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px]">
            <AlertCircle size={11} className="text-amber-500 flex-shrink-0" />
            <span className="text-foreground">{t('import.quelCompte')}</span>
            <select
              value={comptes.some(c => c.id === valeur) || valeur === 'aucun' ? valeur : ''}
              onChange={e => setChoix(c => ({ ...c, [lot.cle]: e.target.value }))}
              className="ml-auto max-w-[60%] px-1.5 py-0.5 text-[11px] bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary/50"
              aria-label={t('import.quelCompte')}
            >
              <option value="" disabled>{t('import.choisirCompte')}</option>
              {comptesProposes(comptes, lot.devinette.demo).map(c => <option key={c.id} value={c.id}>{libelleCompte(c)}</option>)}
              <option value="aucun">{t('import.neRienRanger')}</option>
            </select>
          </div>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5 text-[11px] min-w-0">
        <span className="text-muted-foreground flex-shrink-0">{t('import.compte')}</span>
        <span className="font-medium text-foreground truncate">{nomCompte(compteId)}</span>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">
          {choisi ? t('import.choisiParToi') : lot.devinette.par === 'page' ? t('tradesPage.vuSurLaPage') : t('tradesPage.devine')}
        </span>
        <button onClick={() => setChanger(c => ({ ...c, [lot.cle]: true }))} className="ml-auto text-[10px] text-primary hover:underline flex-shrink-0">
          {t('import.changer')}
        </button>
      </div>
    )
  }

  // Deux lignes par trade, pour tenir dans la largeur du panneau : instrument,
  // sens et quantité, puis la date et les prix ; le P&L à droite.
  const tableau = (lignes: LigneApercu[]) => (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-[11px] leading-tight">
        <thead className="sr-only">
          <tr>
            <th>{t('tradesPage.colInstrument')}, {t('tradesPage.colSens')}, {t('tradesPage.colQuantite')}, {t('tradesPage.colDate')}, {t('tradesPage.colPrix')}</th>
            <th>{t('tradesPage.colPnl')}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className={`border-t border-border first:border-t-0 ${l.nouveau ? 'text-foreground' : 'text-muted-foreground bg-muted/30'}`}>
              <td className="px-2 py-1.5 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-medium">{l.symbole}</span>
                  <span className={l.direction === 'long' ? 'text-green-700 dark:text-green-400' : l.direction === 'short' ? 'text-red-700 dark:text-red-400' : ''}>
                    {l.direction === 'long' ? 'Long' : l.direction === 'short' ? 'Short' : '-'}
                  </span>
                  <span className="text-muted-foreground">× {montant(l.quantite)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {quand(l.entreLe)} · {montant(l.prixEntree)}{l.prixSortie !== null ? ` → ${montant(l.prixSortie)}` : ''}
                </div>
              </td>
              <td className="px-2 py-1.5 text-right align-top whitespace-nowrap">
                <div className={!l.nouveau ? '' : l.pnl > 0 ? 'text-green-600 dark:text-green-400 font-medium' : l.pnl < 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'font-medium'}>
                  {montant(l.pnl, l.devise)}
                </div>
                {!l.nouveau && <div className="text-[9px] uppercase tracking-wide mt-0.5">{t('tradesPage.dejaLigne')}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const blocLot = (lot: LotCapture) => {
    const a = apercuDuLot(lot)
    const compteId = compteDuLot(lot)
    return (
      <div key={lot.cle} className={`space-y-1.5 ${lots.length > 1 ? 'pl-2 border-l-2 border-border' : ''}`}>
        {lots.length > 1 && lot.compteLu && <p className="text-[10px] font-medium text-muted-foreground">{abregerIdentifiant(lot.compteLu)}</p>}
        {etape !== 'rapport' && ligneCompte(lot)}
        {(!a || a.etat === 'chargement') && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 size={10} className="animate-spin" />{t('import.lecture')}</p>
        )}
        {a?.etat === 'erreur' && <p className="text-[11px] text-red-600 dark:text-red-400">{a.message}</p>}
        {a?.etat === 'pret' && (
          <>
            <p className="text-[11px] text-muted-foreground">
              {[
                tp('tradesPage.lus1', 'tradesPage.lus', a.apercu.lus),
                tp('tradesPage.nouveaux1', 'tradesPage.nouveaux', a.apercu.nouveaux),
                a.apercu.dejaConnus > 0
                  ? (compteId ? tp('tradesPage.deja1', 'tradesPage.deja', a.apercu.dejaConnus) : tp('tradesPage.dejaSansCompte1', 'tradesPage.dejaSansCompte', a.apercu.dejaConnus))
                  : null,
              ].filter(Boolean).join(' · ')}
            </p>
            {a.apercu.lignes.length > 0 && tableau(a.apercu.lignes)}
            {a.apercu.erreurs.length > 0 && <p className="text-[10px] text-muted-foreground">{a.apercu.erreurs[0]}</p>}
          </>
        )}
      </div>
    )
  }

  const rapport = () => (
    <div className="space-y-1.5">
      {bilans.filter(b => !b.erreur).map(b => (
        <div key={b.compteId} className="space-y-0.5">
          <p className="flex items-start gap-1.5 text-xs text-foreground">
            <Check size={12} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <span>
              {tp('import.rapportLigne1', 'import.rapportLigne', b.importes, { compte: nomCompte(b.compteId) })}
              {b.deja > 0 && `, ${tp('tradesPage.rapportDeja1', 'tradesPage.rapportDeja', b.deja)}`}
            </span>
          </p>
          {b.liees > 0 && <p className="pl-5 text-[11px] text-muted-foreground">{tp('tradesPage.liees1', 'tradesPage.liees', b.liees)}</p>}
        </div>
      ))}
      {bilans.filter(b => b.erreur).map((b, i) => (
        <p key={`e${i}`} className="text-[11px] text-red-600 dark:text-red-400">{b.erreur}</p>
      ))}
      {bilans.some(b => b.importes > 0) && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><Link2 size={11} className="mt-0.5 flex-shrink-0" />{t('tradesPage.lier')}</p>
      )}
    </div>
  )

  const corps = () => {
    if (etape === 'lecture') {
      return (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-foreground"><Loader2 size={12} className="animate-spin" />{t('tradesPage.lecture')}</p>
          <p className="text-[10px] text-muted-foreground">{t('tradesPage.lectureSous')}</p>
        </div>
      )
    }
    if (etape === 'erreur') {
      return (
        <div className="space-y-2">
          <p className="text-xs text-foreground">{message?.texte}</p>
          {message?.connexion ? (
            <button onClick={() => { demanderConnexion(); onClose() }} className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
              {t('import.meConnecter')}
            </button>
          ) : (
            <button onClick={onClose} className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted">{t('import.fermer')}</button>
          )}
        </div>
      )
    }
    if (etape === 'sans-trades') {
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">{t('tradesPage.sansTrades')}</p>
          <p className="text-[11px] text-muted-foreground">{lecture?.remarque || t('tradesPage.sansTradesSous')}</p>
          <button onClick={onClose} className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted">{t('import.fermer')}</button>
        </div>
      )
    }
    if (etape === 'rapport') {
      return (
        <>
          {rapport()}
          <button onClick={onClose} className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{t('import.fermer')}</button>
        </>
      )
    }
    return (
      <>
        <p className="text-[10px] text-muted-foreground">{t('tradesPage.verifier')}</p>
        {lots.map(blocLot)}
        {lecture?.remarque && <p className="text-[10px] text-muted-foreground">{lecture.remarque}</p>}
        {demande.lignesVues > lus && lus >= TRADES_MAX_PAR_LECTURE && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300">{t('tradesPage.plusQueLus', { n: TRADES_MAX_PAR_LECTURE })}</p>
        )}
        {quota && <p className="text-[10px] text-muted-foreground">{phraseQuota(quota)}</p>}
        {sansCompte > 0 && !apercuEnCours && (
          <p className="text-[10px] text-amber-700 dark:text-amber-300">{tp('import.attendCompte1', 'import.attendCompte', sansCompte)}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={etape === 'rangement'}
            className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"
          >
            {t('tradesPage.pasMaintenant')}
          </button>
          <button
            onClick={() => void ranger()}
            disabled={etape === 'rangement' || apercuEnCours || aRanger === 0}
            className="flex-[2] flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {etape === 'rangement' && <Loader2 size={12} className="animate-spin" />}
            {etape === 'rangement' ? t('import.enRangement')
              : aRanger > 0 ? tp('import.ranger1', 'import.ranger', aRanger)
              : sansCompte > 0 ? t('tradesPage.choisirAvant')
              : t('import.rien')}
          </button>
        </div>
      </>
    )
  }

  const titre = etape === 'rapport' ? t('tradesPage.rapportTitre') : t('tradesPage.titre')
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/40 flex items-start justify-center pt-12 px-3"
      onMouseDown={() => { if (etape !== 'rangement') onClose() }}
    >
      <div
        className="w-full max-w-md max-h-[calc(100vh-4rem)] overflow-y-auto bg-background border border-border rounded-xl shadow-lg p-4 space-y-3"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-label={titre}
      >
        <div className="flex items-center gap-2">
          <CandlestickChart size={16} className="text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground flex-1 truncate">{titre}</span>
          <button onClick={onClose} disabled={etape === 'rangement'} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40" aria-label={t('import.fermer')}>
            <X size={14} />
          </button>
        </div>
        {corps()}
      </div>
    </div>,
    document.body,
  )
}

export default TradesDeLaPage
